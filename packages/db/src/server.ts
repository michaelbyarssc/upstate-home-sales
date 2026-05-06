import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_HEADER } from './index';

/**
 * Server Supabase client for RSC + Route Handlers + Server Actions.
 * Reads the active-org cookie and forwards it as the `x-active-org` header
 * so RLS can narrow by the currently-viewed org.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = cookies();
  const activeOrg = cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null;

  return createServerClient(url, key, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Called from a Server Component — cookies are read-only there.
          // Mutations happen in Route Handlers / Server Actions / middleware.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // See above.
        }
      },
    },
    global: {
      headers: activeOrg ? { [ACTIVE_ORG_HEADER]: activeOrg } : {},
    },
  });
}
