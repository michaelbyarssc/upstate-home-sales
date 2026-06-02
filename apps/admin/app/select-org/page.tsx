import { redirect } from 'next/navigation';
import { createClient } from '@uhs/db/server';
import type { OrgMembershipWithOrg } from '@uhs/db';
import { OrgPickerList } from './picker';
import './select-org.css';

export default async function SelectOrgPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('org_members')
    .select('user_id, org_id, role, status, scoped_lots, orgs:org_id ( id, slug, name, brand_color, logo_url )')
    .eq('user_id', user.id)
    .eq('status', 'active');

  if (error) {
    return (
      <div className="switcher-wrap">
        <div className="switcher-card">
          <h2>Couldn&apos;t load your organizations</h2>
          <p className="sub">{error.message}</p>
        </div>
      </div>
    );
  }

  const memberships = (data ?? []) as unknown as OrgMembershipWithOrg[];

  if (memberships.length === 0) redirect('/no-access');

  return (
    <div className="switcher-wrap">
      <div className="switcher-card">
        <div className="brand">
          <div className="mark">U</div>
          <div className="name">
            Upstate Home <em>Center</em>
          </div>
        </div>
        <h2>Choose a dealership</h2>
        <p className="sub">You belong to {memberships.length} organizations. Pick the one to work in.</p>
        <OrgPickerList memberships={memberships} next={searchParams.next ?? '/dashboard'} />
      </div>
    </div>
  );
}
