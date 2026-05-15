import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { createServiceClient } from '@uhs/db/service';
import { ACTIVE_ORG_COOKIE, type Lot, type OrgMember, type Role } from '@uhs/db';
import { UsersTable, type MemberProfile } from './users-table';
import { InviteForm } from './invite-form';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;

  const [{ data: members }, { data: lots }] = await Promise.all([
    supabase
      .from('org_members')
      .select('user_id, org_id, role, scoped_lots, status, in_rotation, invited_at, last_active_at, created_at')
      .order('role')
      .order('created_at'),
    supabase.from('lots').select('id, name').is('deleted_at', null).order('name'),
  ]);

  const profiles = await loadMemberProfiles((members ?? []).map((m) => m.user_id));

  return (
    <>
      <div className="page-header">
        <div className="eyebrow">Workspace · Week 7</div>
        <h1>Users &amp; roles</h1>
        <p>{members?.length ?? 0} members in this org.</p>
      </div>

      <UsersTable
        members={(members ?? []) as OrgMember[]}
        lots={(lots ?? []) as Pick<Lot, 'id' | 'name'>[]}
        profiles={profiles}
      />

      <div style={{ marginTop: 32 }}>
        <h3 style={{ marginBottom: 12 }}>Add a user</h3>
        <InviteForm orgId={orgId} lots={(lots ?? []) as Pick<Lot, 'id' | 'name'>[]} />
      </div>
    </>
  );
}

async function loadMemberProfiles(userIds: string[]): Promise<Record<string, MemberProfile>> {
  if (userIds.length === 0) return {};
  // Service-role only, server-side. Falls back to {} so the page still
  // renders (with UUID-prefix labels) if the key is missing locally.
  let admin: ReturnType<typeof createServiceClient>;
  try {
    admin = createServiceClient();
  } catch {
    return {};
  }
  const lookups = await Promise.all(
    userIds.map(async (id) => {
      try {
        const { data } = await admin.auth.admin.getUserById(id);
        return { id, user: data?.user ?? null };
      } catch {
        return { id, user: null };
      }
    }),
  );
  const profiles: Record<string, MemberProfile> = {};
  for (const { id, user } of lookups) {
    if (!user) continue;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const name =
      (typeof meta.full_name === 'string' && meta.full_name) ||
      (typeof meta.name === 'string' && meta.name) ||
      null;
    const phone = (typeof meta.phone === 'string' && meta.phone) || null;
    profiles[id] = { email: user.email ?? null, name, phone };
  }
  return profiles;
}
