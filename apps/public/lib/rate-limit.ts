import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * PR 3.4 — per-key sliding-window rate limiter for the public v1 API.
 *
 * Reads Vercel KV (Upstash Redis under the hood) via standard env vars
 * `KV_REST_API_URL` + `KV_REST_API_TOKEN`. When those are unset the limiter
 * no-ops with success=true so local dev + preview environments keep working
 * without Redis provisioned.
 *
 * Rate state is bucketed by `apikey:<key_hash>` so per-org keys never share
 * a bucket. Each call to `enforceRateLimit` advances the sliding window by
 * one and returns whether the request fits within the per-minute allowance.
 */

let redis: Redis | null = null;
function redisClient(): Redis | null {
  if (redis) return redis;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

// Per-org-key limiter cache. `Ratelimit` instances are cheap but caching
// avoids re-allocating per request.
const limiterCache = new Map<number, Ratelimit>();
function limiterFor(perMinute: number, client: Redis): Ratelimit {
  let r = limiterCache.get(perMinute);
  if (!r) {
    r = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(perMinute, '60 s'),
      analytics: false,
      prefix: 'uhs:apikey',
    });
    limiterCache.set(perMinute, r);
  }
  return r;
}

export type RateLimitOutcome = {
  ok: boolean;
  /** Requests allowed in this window. */
  limit: number;
  /** Requests remaining in this window. */
  remaining: number;
  /** Unix ms when the window resets. */
  reset: number;
  /** True when no Redis is configured — limit silently bypassed. */
  bypassed: boolean;
};

export async function enforceRateLimit(
  keyHash: string,
  perMinute: number,
): Promise<RateLimitOutcome> {
  if (!keyHash) {
    return { ok: false, limit: perMinute, remaining: 0, reset: 0, bypassed: false };
  }
  const limit = Math.max(1, perMinute || 60);
  const client = redisClient();
  if (!client) {
    return { ok: true, limit, remaining: limit, reset: Date.now() + 60_000, bypassed: true };
  }
  const r = await limiterFor(limit, client).limit(keyHash);
  return {
    ok: r.success,
    limit: r.limit,
    remaining: r.remaining,
    reset: r.reset,
    bypassed: false,
  };
}

export function rateLimitHeaders(outcome: RateLimitOutcome): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(outcome.limit),
    'X-RateLimit-Remaining': String(Math.max(0, outcome.remaining)),
    'X-RateLimit-Reset': String(Math.floor(outcome.reset / 1000)),
    ...(outcome.ok ? {} : {
      'Retry-After': String(Math.max(1, Math.ceil((outcome.reset - Date.now()) / 1000))),
    }),
  };
}
