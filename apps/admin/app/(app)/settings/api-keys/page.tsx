import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type OrgApiKey } from '@uhs/db';
import { ApiKeysManager } from './api-keys-manager';

export const dynamic = 'force-dynamic';

export default async function ApiKeysPage() {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
  if (!orgId) return <div className="placeholder"><strong>No active org.</strong> <Link href="/select-org">Pick one</Link>.</div>;
  const { data: keys } = await supabase
    .from('org_api_keys')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  return (
    <>
      <div className="page-header">
        <Link href="/settings" style={{ fontSize: 12, color: 'var(--adm-ink-mute)', textDecoration: 'none' }}>
          ← Settings
        </Link>
        <h1 style={{ marginTop: 6 }}>API keys</h1>
        <p style={{ color: 'var(--adm-ink-mute)', fontSize: 13, marginTop: 4 }}>
          Bearer tokens for the read-only public inventory API at <code>/api/v1/inventory</code>.
          Keys are shown ONCE at creation — store them securely.
        </p>
      </div>
      <ApiKeysManager initial={(keys ?? []) as OrgApiKey[]} />
    </>
  );
}
