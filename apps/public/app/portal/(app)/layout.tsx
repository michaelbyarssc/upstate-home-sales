import { redirect } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { PortalBodyClass } from '../portal-body-class';
import { SignOutButton } from './sign-out-button';
import '../portal.css';

export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    const path = headers().get('x-pathname') ?? '/portal';
    redirect(`/portal/login?next=${encodeURIComponent(path)}`);
  }

  const { data: buyer } = await sb
    .from('buyers')
    .select('full_name, email')
    .eq('id', user.id)
    .maybeSingle();

  const pathname = headers().get('x-pathname') ?? '';
  const isActive = (href: string) =>
    href === '/portal' ? pathname === '/portal' : pathname.startsWith(href);

  return (
    <>
      <PortalBodyClass />
      <div className="portal-shell">
        <header className="portal-bar">
          <Link href="/portal" className="brand">Upstate Home <em>Sales</em></Link>
          <nav>
            <Link href="/portal" className={isActive('/portal') ? 'active' : ''}>Dashboard</Link>
            <Link href="/portal/documents" className={isActive('/portal/documents') ? 'active' : ''}>Documents</Link>
            <Link href="/portal/milestones" className={isActive('/portal/milestones') ? 'active' : ''}>Milestones</Link>
            <Link href="/portal/profile" className={isActive('/portal/profile') ? 'active' : ''}>Profile</Link>
          </nav>
          <span className="who">{buyer?.full_name ?? user.email}</span>
          <SignOutButton />
        </header>

        <main className="portal-content">{children}</main>
      </div>
    </>
  );
}
