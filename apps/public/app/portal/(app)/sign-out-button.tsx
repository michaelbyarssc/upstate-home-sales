'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@uhs/db/browser';

export function SignOutButton() {
  const router = useRouter();

  async function onClick() {
    const sb = createClient();
    await sb.auth.signOut();
    router.push('/portal/login');
    router.refresh();
  }

  return (
    <button type="button" className="sign-out" onClick={onClick}>
      Sign out
    </button>
  );
}
