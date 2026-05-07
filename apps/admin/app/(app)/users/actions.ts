'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@uhs/db/server';
import { createServiceClient } from '@uhs/db/service';
import type { OrgMember, Role } from '@uhs/db';

export async function updateMember(
  userId: string,
  patch: Partial<Pick<OrgMember, 'role' | 'status' | 'scoped_lots'>>,
) {
  const supabase = createClient();
  const { error } = await supabase.from('org_members').update(patch).eq('user_id', userId);
  if (error) throw new Error(error.message);
  revalidatePath('/users');
}

/**
 * Invite a user to the active org.
 * - If a user with that email already exists in auth.users, link them as
 *   an active member (no email sent).
 * - Otherwise, send a Supabase magic-link invite (admin API) and create a
 *   pending org_members row tied to the new user.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY at runtime.
 */
export async function inviteUser(args: {
  orgId: string;
  email: string;
  role: Role;
  scopedLot: string | null;
}): Promise<{ ok: true; invited_existing: boolean }> {
  if (!args.email) throw new Error('Email is required');

  const sb = createServiceClient();
  const scoped_lots = args.scopedLot ? [args.scopedLot] : null;

  // Look up existing user by email if the SDK exposes it; otherwise invite
  // unconditionally and let Supabase return an error if the user exists.
  let userId: string | null = null;
  let invited_existing = false;

  type AdminWithLookup = { getUserByEmail?: (email: string) => Promise<{ data?: { user?: { id: string } } | null }> };
  const adminApi = sb.auth.admin as unknown as AdminWithLookup;
  if (typeof adminApi.getUserByEmail === 'function') {
    try {
      const r = await adminApi.getUserByEmail(args.email);
      userId = r?.data?.user?.id ?? null;
    } catch { /* not found */ }
  }

  if (userId) {
    invited_existing = true;
  } else {
    const redirectTo = `${process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001'}/login`;
    const { data, error } = await sb.auth.admin.inviteUserByEmail(args.email, { redirectTo });
    if (error || !data?.user) throw new Error(error?.message ?? 'Invite failed');
    userId = data.user.id;
  }

  const { error: memberErr } = await sb
    .from('org_members')
    .upsert(
      {
        user_id: userId,
        org_id: args.orgId,
        role: args.role,
        scoped_lots,
        status: invited_existing ? 'active' : 'pending',
        invited_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,org_id' },
    );
  if (memberErr) throw new Error(memberErr.message);

  revalidatePath('/users');
  return { ok: true, invited_existing };
}
