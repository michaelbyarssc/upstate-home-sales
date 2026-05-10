/**
 * Marketing attribution capture for the public site.
 *
 * Reads UTM and click-id params from the landing URL on first visit, persists
 * them in sessionStorage so they survive client-side navigation, and exposes
 * `getAttribution()` for forms to attach to lead-intake submissions.
 *
 * sessionStorage (not localStorage) because attribution is per-visit; a user
 * arriving fresh from a new ad source should overwrite, not stack.
 */

const KEY = 'uhs_attr_v1';

export type Attribution = {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  referrer_url?: string | null;
  landing_path?: string | null;
};

const FIELDS: Array<keyof Attribution> = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
];

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/**
 * Capture URL params + referrer + landing path. Idempotent within a session
 * unless the URL contains a *new* utm_source or click-id, in which case the
 * stored attribution is replaced (most recent touch wins).
 */
export function captureAttributionFromUrl(): Attribution | null {
  const storage = safeStorage();
  if (!storage) return null;

  const url = new URL(window.location.href);
  const fromUrl: Attribution = {};
  for (const f of FIELDS) {
    const v = url.searchParams.get(f);
    if (v) fromUrl[f] = v;
  }

  const hasNewTouch =
    fromUrl.utm_source || fromUrl.gclid || fromUrl.fbclid || fromUrl.utm_campaign;

  if (hasNewTouch) {
    const next: Attribution = {
      ...fromUrl,
      referrer_url: document.referrer || null,
      landing_path: url.pathname + url.search,
    };
    storage.setItem(KEY, JSON.stringify(next));
    return next;
  }

  // No new attribution params on this URL — keep what we already have.
  const existing = getAttribution();
  if (existing) return existing;

  // First-touch fallback: at least record landing + referrer for organic traffic.
  const next: Attribution = {
    referrer_url: document.referrer || null,
    landing_path: url.pathname + url.search,
  };
  storage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function getAttribution(): Attribution | null {
  const storage = safeStorage();
  if (!storage) return null;
  const raw = storage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Attribution;
  } catch {
    return null;
  }
}

export function clearAttribution(): void {
  safeStorage()?.removeItem(KEY);
}
