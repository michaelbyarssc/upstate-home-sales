import { createClient } from '@uhs/db/server';
import { ProfileForm } from './profile-form';
import type { Buyer } from '@uhs/db';

export const metadata = { title: 'Profile · Buyer portal' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage({ searchParams }: { searchParams: { recovery?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data: buyer } = await sb
    .from('buyers')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow">Account</div>
        <h1 style={{ marginTop: 6 }}>Profile</h1>
        <p style={{ fontSize: 'var(--t-body-l)', color: 'var(--c-ink-soft)', marginTop: 8 }}>
          Update how the dealership reaches you, and change your password.
        </p>
      </div>

      <ProfileForm
        buyer={buyer as Buyer | null}
        userEmail={user.email ?? ''}
        recoveryMode={searchParams.recovery === '1'}
      />
    </>
  );
}
