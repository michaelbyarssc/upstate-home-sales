import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/**
 * Buyer-portal Supabase auth callback.
 *
 * Handles three flows:
 *   - Magic-link sign-in       (?code=XXX, no `type`)
 *   - Email confirmation       (?code=XXX, type=signup)
 *   - Password recovery        (?code=XXX, type=recovery → land on /portal/profile to set new pw)
 *
 * Exchanges the one-time code for a session cookie, then upserts a buyers
 * row from the auth user's metadata (full_name + phone collected at signup).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/portal';
  const type = url.searchParams.get('type');

  if (!code) {
    return NextResponse.redirect(new URL('/portal/login?error=missing_code', req.url));
  }

  const res = NextResponse.redirect(
    new URL(type === 'recovery' ? '/portal/profile?recovery=1' : next, req.url),
  );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data?.user) {
    const u = new URL('/portal/login', req.url);
    u.searchParams.set('error', error?.message ?? 'auth_failed');
    return NextResponse.redirect(u);
  }

  // Upsert the buyers row. Idempotent — repeats just refresh updated_at.
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const full_name =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    data.user.email?.split('@')[0] ||
    'Buyer';
  const phone = typeof meta.phone === 'string' ? meta.phone : null;

  await supabase
    .from('buyers')
    .upsert(
      {
        id: data.user.id,
        full_name,
        email: data.user.email ?? '',
        phone,
      },
      { onConflict: 'id' },
    );

  return res;
}
