'use client';

import { createBrowserClient } from '@supabase/ssr';
import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_HEADER } from './index';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

/**
 * Browser Supabase client. Sends the active-org cookie value as the
 * `x-active-org` header on every PostgREST request, where it's read by
 * `auth.active_org()` for RLS narrowing.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createBrowserClient(url, key, {
    global: {
      headers: () => {
        const orgId = readCookie(ACTIVE_ORG_COOKIE);
        return orgId ? { [ACTIVE_ORG_HEADER]: orgId } : {};
      },
    },
  });
}
