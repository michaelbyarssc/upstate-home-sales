'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@uhs/db/server';
import { createServiceClient } from '@uhs/db/service';
import type { OrgMember, Role } from '@uhs/db';

export async function updateMember(
  userId: string,
  patch: Partial<Pick<OrgMember, 'role' | 'status' | 'scoped_lots' | 'in_rotation'>>,
) {
  const supabase = createClient();
  const { error } = await supabase.from('org_members').update(patch).eq('user_id', userId);
  if (error) throw new Error(error.message);
  revalidatePath('/users');
}

/**
 * Create a new user with email + password and add them to the org.
 */
export async function createUser(args: {
  orgId: string;
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: Role;
  scopedLot: string | null;
}): Promise<{ ok: true }> {
  if (!args.email) throw new Error('Email is required');
  if (!args.password || args.password.length < 8) throw new Error('Password must be at least 8 characters');
  if (!args.fullName.trim()) throw new Error('Name is required');

  const metadata: Record<string, string> = { full_name: args.fullName.trim() };
  if (args.phone?.trim()) metadata.phone = args.phone.trim();

  const sb = createServiceClient();
  const { data, error } = await sb.auth.admin.createUser({
    email: args.email,
    password: args.password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data?.user) throw new Error(error?.message ?? 'User creation failed');

  const scoped_lots = args.scopedLot ? [args.scopedLot] : null;
  const { error: memberErr } = await sb
    .from('org_members')
    .insert({
      user_id: data.user.id,
      org_id: args.orgId,
      role: args.role,
      scoped_lots,
      status: 'active',
      invited_at: new Date().toISOString(),
    });
  if (memberErr) throw new Error(memberErr.message);

  revalidatePath('/users');
  return { ok: true };
}

/**
 * Update a user's profile (name, email) via admin API.
 */
export async function updateUserProfile(
  userId: string,
  patch: { fullName?: string; email?: string; phone?: string },
): Promise<{ ok: true }> {
  const sb = createServiceClient();
  const updates: Record<string, unknown> = {};
  if (patch.email) updates.email = patch.email;
  if (patch.fullName !== undefined || patch.phone !== undefined) {
    // Read existing metadata so we don't lose fields during shallow merge
    const { data: existing } = await sb.auth.admin.getUserById(userId);
    const existingMeta = (existing?.user?.user_metadata ?? {}) as Record<string, unknown>;
    updates.user_metadata = {
      ...existingMeta,
      ...(patch.fullName !== undefined ? { full_name: patch.fullName.trim() } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone.trim() || null } : {}),
    };
  }
  if (Object.keys(updates).length === 0) throw new Error('Nothing to update');

  const { error } = await sb.auth.admin.updateUserById(userId, updates);
  if (error) throw new Error(error.message);

  revalidatePath('/users');
  return { ok: true };
}

/**
 * Send a password reset email to a user.
 */
export async function sendPasswordReset(userId: string): Promise<{ ok: true }> {
  const sb = createServiceClient();
  const { data: userData, error: fetchErr } = await sb.auth.admin.getUserById(userId);
  if (fetchErr || !userData?.user?.email) throw new Error('Could not find user email');

  const redirectTo = `${process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001'}/login`;
  const { error } = await sb.auth.admin.generateLink({
    type: 'recovery',
    email: userData.user.email,
    options: { redirectTo },
  });
  if (error) throw new Error(error.message);

  revalidatePath('/users');
  return { ok: true };
}

/**
 * Directly set a user's password via admin API.
 */
export async function setUserPassword(userId: string, password: string): Promise<{ ok: true }> {
  if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');

  const sb = createServiceClient();
  const { error } = await sb.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(error.message);

  revalidatePath('/users');
  return { ok: true };
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
