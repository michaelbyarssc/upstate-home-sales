import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { ACTIVE_ORG_COOKIE } from '@uhs/db';

// Routes that don't require a user session. Webhooks (verified by re-fetching
// from the provider) and crons (gated by CRON_SECRET) enforce their own auth and
// are called by external services with no Supabase session, so they must skip the
// session check + login redirect here.
const PUBLIC_PREFIXES = [
  '/login',
  '/auth/callback',
  '/_next',
  '/favicon.ico',
  '/api/webhooks',
  '/api/cron',
];

export async function middleware(req: NextRequest) {
  // Expose the current pathname to server components via a request header so
  // layouts can highlight active nav items without each child duplicating the work.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', req.nextUrl.pathname);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return res;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          req.cookies.set({ name, value, ...options });
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({ name, value: '', ...options });
          res.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  // Touches the session cookie if needed and gives us the user.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Resolve active org. If none picked yet, route to /select-org.
  const activeOrg = req.cookies.get(ACTIVE_ORG_COOKIE)?.value ?? null;

  if (pathname === '/select-org') return res;

  if (!activeOrg) {
    // Look up memberships. If exactly one, auto-select. Otherwise → switcher.
    const { data: memberships } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (!memberships || memberships.length === 0) {
      // User has no active org. Send to a friendly stub for now.
      const url = req.nextUrl.clone();
      url.pathname = '/no-access';
      return NextResponse.redirect(url);
    }

    if (memberships.length === 1) {
      res.cookies.set({
        name: ACTIVE_ORG_COOKIE,
        value: memberships[0]!.org_id,
        path: '/',
        httpOnly: false,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
      return res;
    }

    const url = req.nextUrl.clone();
    url.pathname = '/select-org';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Defense in depth: validate that the cookie's org is one the user belongs
  // to. Cheap belt-and-suspenders alongside the RLS check the function does.
  const { data: membershipMatch } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('org_id', activeOrg)
    .eq('status', 'active')
    .maybeSingle();

  if (!membershipMatch) {
    res.cookies.delete(ACTIVE_ORG_COOKIE);
    const url = req.nextUrl.clone();
    url.pathname = '/select-org';
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  // Run on everything except static assets + Next internals.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
