import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE } from '@uhs/db';
import { UserMenu } from './user-menu';
import './app-shell.css';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const activeOrgId = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
  if (!activeOrgId) redirect('/select-org');

  const [{ data: org }, { data: memberships }, { data: platform }] = await Promise.all([
    supabase.from('orgs').select('id, name, brand_color').eq('id', activeOrgId).maybeSingle(),
    supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .eq('status', 'active'),
    supabase.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
  ]);

  const orgCount = memberships?.length ?? 0;
  const isPlatformAdmin = !!platform;

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand">
          <div className="mark" style={{ background: org?.brand_color ?? 'var(--adm-accent)' }}>
            {(org?.name ?? 'U').slice(0, 1)}
          </div>
          <div className="name">
            <div className="org-name">{org?.name ?? 'Upstate Homes'}</div>
            <div className="org-tag">Dealer admin</div>
          </div>
        </div>

        <nav className="nav">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/inventory">Inventory</Link>
          <Link href="/leads">Leads</Link>
          <Link href="/trade-ins">Trade-ins</Link>
          <Link href="/users">Users</Link>
          <Link href="/settings">Settings</Link>
        </nav>

        <div className="sidebar-foot">
          <UserMenu
            email={user.email ?? ''}
            canSwitch={orgCount > 1}
            isPlatformAdmin={isPlatformAdmin}
          />
        </div>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}
