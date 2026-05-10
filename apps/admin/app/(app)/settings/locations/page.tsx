import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type Location } from '@uhs/db';
import { LocationsManager } from './locations-manager';

export const dynamic = 'force-dynamic';

export default async function LocationsPage() {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
  if (!orgId) {
    return (
      <div className="placeholder">
        <strong>No active org.</strong> <Link href="/select-org">Choose an org</Link> first.
      </div>
    );
  }

  const { data: locations } = await supabase
    .from('locations')
    .select('*')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('name');

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <Link href="/settings" style={{ fontSize: 12, color: 'var(--adm-ink-mute)', textDecoration: 'none' }}>
            ← Settings
          </Link>
          <h1 style={{ marginTop: 6 }}>Locations</h1>
          <p style={{ color: 'var(--adm-ink-mute)', fontSize: 13, marginTop: 4 }}>
            Physical dealer sites. Each one can have its own branding, hours, and inventory lots.
            Leads route to the nearest location by buyer zip.
          </p>
        </div>
      </div>
      <LocationsManager orgId={orgId} initial={(locations ?? []) as Location[]} />
    </>
  );
}
