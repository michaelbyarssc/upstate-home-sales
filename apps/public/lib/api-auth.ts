import { createHash } from 'node:crypto';
import { createServiceClient } from '@uhs/db/service';
import type { NextRequest } from 'next/server';

/**
 * Phase I — public API auth helper.
 *
 * Validates a Bearer token from the Authorization header against
 * org_api_keys.key_hash (SHA-256). Returns the resolved org_id + scopes
 * + per-key rate limit on success. Bumps last_used_at as a side effect.
 */

export type AuthedKey = {
  orgId: string;
  scopes: string[];
  /** SHA-256 of the bearer token — opaque rate-limit bucket id. */
  keyHash: string;
  rateLimitPerMinute: number;
};

function hashKey(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

export async function authenticateApiKey(req: NextRequest | Request): Promise<AuthedKey | null> {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;

  const keyHash = hashKey(token);
  const sb = createServiceClient();
  const { data } = await sb.rpc('validate_api_key', { p_key_hash: keyHash });
  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { org_id: string; scopes: string[]; rate_limit_per_minute?: number }
    | undefined;
  if (!row?.org_id) return null;
  return {
    orgId: row.org_id,
    scopes: row.scopes ?? [],
    keyHash,
    rateLimitPerMinute: row.rate_limit_per_minute ?? 60,
  };
}

export function hasScope(authed: AuthedKey, required: string): boolean {
  return authed.scopes.includes(required) || authed.scopes.includes('*');
}
