import { NextResponse } from 'next/server';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE } from '@uhs/db';

export async function POST(req: Request) {
  const { orgId } = (await req.json()) as { orgId?: string };
  if (!orgId || typeof orgId !== 'string') {
    return new NextResponse('orgId required', { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse('not authenticated', { status: 401 });

  // Verify the user actually belongs to this org. RLS would also stop a bad
  // cookie at query time, but rejecting here gives a clear error and avoids
  // setting a cookie that the middleware will just clear on the next request.
  const { data: membership, error } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !membership) {
    return new NextResponse('not a member of this organization', { status: 403 });
  }

  const res = NextResponse.json({ ok: true, orgId });
  res.cookies.set({
    name: ACTIVE_ORG_COOKIE,
    value: orgId,
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ACTIVE_ORG_COOKIE);
  return res;
}
