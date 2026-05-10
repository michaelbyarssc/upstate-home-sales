'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type OrgApiKey } from '@uhs/db';

const KEY_PREFIX = 'uhs_';

function generateKey(): { plain: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  const plain = `${KEY_PREFIX}${raw}`;
  const hash = createHash('sha256').update(plain).digest('hex');
  return { plain, hash };
}

/** Create a new API key. Returns the plaintext value ONCE — caller must
 *  show it to the dealer immediately and never store it server-side. */
export async function createApiKey(args: {
  name: string;
  scopes?: string[];
}): Promise<{ key: string; row: OrgApiKey }> {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org');

  const name = args.name.trim();
  if (!name) throw new Error('Name is required');

  const { plain, hash } = generateKey();
  const { data, error } = await supabase
    .from('org_api_keys')
    .insert({
      org_id: orgId,
      name,
      key_hash: hash,
      scopes: args.scopes && args.scopes.length > 0 ? args.scopes : ['read:inventory'],
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Insert failed');

  revalidatePath('/settings/api-keys');
  return { key: plain, row: data as OrgApiKey };
}

export async function revokeApiKey(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('org_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/settings/api-keys');
}
