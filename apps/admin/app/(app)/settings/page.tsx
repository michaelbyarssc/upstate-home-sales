import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type DeliveryZone, type Lot, type Org } from '@uhs/db';
import { OrgSettingsForm } from './org-form';
import { LotsManager } from './lots-manager';
import { DeliveryZonesManager } from './delivery-zones-manager';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
  if (!orgId) {
    return (
      <div className="placeholder">
        <strong>No active org.</strong> <Link href="/select-org">Choose an org</Link> first.
      </div>
    );
  }

  const [{ data: org }, { data: lots }, { data: zones }] = await Promise.all([
    supabase.from('orgs').select('*').eq('id', orgId).maybeSingle(),
    supabase.from('lots').select('*').eq('org_id', orgId).is('deleted_at', null).order('name'),
    supabase.from('delivery_zones').select('*').eq('org_id', orgId).order('kind').order('value'),
  ]);

  if (!org) {
    return <div className="placeholder">Org not found.</div>;
  }

  return (
    <>
      <div className="page-header">
        <div className="eyebrow">Workspace · Week 7</div>
        <h1>Settings</h1>
        <p>Org branding, default markup %, SMS consent text, lots.</p>
      </div>

      <div style={{ display: 'grid', gap: 24, gridTemplateColumns: '1fr', maxWidth: 800 }}>
        <OrgSettingsForm org={org as Org} />
        <LotsManager orgId={orgId} initialLots={(lots ?? []) as Lot[]} />
        <DeliveryZonesManager orgId={orgId} initialZones={(zones ?? []) as DeliveryZone[]} />
        <Link href="/audit" style={{ color: 'var(--adm-accent)', fontSize: 13 }}>
          View audit log →
        </Link>
      </div>
    </>
  );
}
