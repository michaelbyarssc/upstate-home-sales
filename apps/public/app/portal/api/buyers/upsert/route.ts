import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/**
 * Upsert the signed-in buyer's profile row.
 *
 * Called from the signup form right after Supabase auth.signUp completes
 * (when email confirmation is OFF and a session exists immediately) so the
 * buyers row is in place before the dashboard loads. Also safe to call
 * later — uses the user's own session and RLS lets them upsert their own row.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { full_name?: string; email?: string; phone?: string | null }
    | null;
  if (!body) return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });

  const res = NextResponse.json({ ok: true });

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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });

  const full_name = (body.full_name ?? '').trim() || user.email?.split('@')[0] || 'Buyer';
  const email = (body.email ?? user.email ?? '').trim();
  const phone = (body.phone ?? null)?.toString().trim() || null;

  const { error } = await supabase
    .from('buyers')
    .upsert({ id: user.id, full_name, email, phone }, { onConflict: 'id' });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return res;
}
