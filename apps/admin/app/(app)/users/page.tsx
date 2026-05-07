import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type Lot, type OrgMember, type Role } from '@uhs/db';
import { UsersTable } from './users-table';
import { InviteForm } from './invite-form';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;

  const [{ data: members }, { data: lots }] = await Promise.all([
    supabase
      .from('org_members')
      .select('user_id, org_id, role, scoped_lots, status, invited_at, last_active_at, created_at')
      .order('role')
      .order('created_at'),
    supabase.from('lots').select('id, name').is('deleted_at', null).order('name'),
  ]);

  // Look up emails for each member from auth.users via the admin API would
  // require service-role; we keep this simple by showing the first 8 chars
  // of the user_id as a label. Real app would expose an /api/users/lookup.

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
      />

      <div style={{ marginTop: 32 }}>
        <h3 style={{ marginBottom: 12 }}>Invite a user</h3>
        <InviteForm orgId={orgId} lots={(lots ?? []) as Pick<Lot, 'id' | 'name'>[]} />
      </div>
    </>
  );
}
