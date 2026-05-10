import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type OrgIntegration } from '@uhs/db';
import { IntegrationsForm } from './integrations-form';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
  if (!orgId) {
    return <div className="placeholder"><strong>No active org.</strong> <Link href="/select-org">Pick one</Link>.</div>;
  }
  const { data } = await supabase.from('org_integrations').select('*').eq('org_id', orgId);
  const byKind = Object.fromEntries(((data ?? []) as OrgIntegration[]).map((i) => [i.kind, i]));
  return <IntegrationsForm initialByKind={byKind} />;
}
