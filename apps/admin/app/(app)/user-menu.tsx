'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@uhs/db/browser';

export function UserMenu({
  email,
  canSwitch,
  isPlatformAdmin,
}: {
  email: string;
  canSwitch: boolean;
  isPlatformAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    await fetch('/api/active-org', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  }

  async function switchOrg() {
    await fetch('/api/active-org', { method: 'DELETE' });
    router.push('/select-org');
  }

  return (
    <div className="user-menu">
      <button
        className="user-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="user-menu-avatar">{email.slice(0, 1).toUpperCase()}</span>
        <span className="user-menu-email">{email}</span>
        {isPlatformAdmin ? <span className="user-menu-badge">platform</span> : null}
      </button>
      {open ? (
        <div className="user-menu-pop" role="menu">
          {canSwitch ? (
            <button className="user-menu-item" onClick={switchOrg} role="menuitem">
              Switch organization
            </button>
          ) : null}
          <button className="user-menu-item" onClick={signOut} role="menuitem">
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
