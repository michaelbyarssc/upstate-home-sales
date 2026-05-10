import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@uhs/db/server';
import type { Home, OrgSetbackRules, PropertyPlacement } from '@uhs/db';
import { PlacementEditor } from './placement-editor';
import './place.css';

export default async function PlacementPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: home }, { data: existing }] = await Promise.all([
    supabase.from('homes').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('property_placements')
      .select('*')
      .eq('home_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!home) notFound();

  // Setback rules — every org should have a row from migration 0016 backfill,
  // but fall back to defaults if not.
  const { data: setback } = await supabase
    .from('org_setback_rules')
    .select('*')
    .eq('org_id', home.org_id)
    .maybeSingle();

  const setbacks: OrgSetbackRules = (setback as OrgSetbackRules | null) ?? {
    org_id: home.org_id,
    front_ft: 25,
    side_ft: 10,
    rear_ft: 25,
    road_easement_ft: 0,
    updated_at: new Date().toISOString(),
  };

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
  const lgTileKey = process.env.NEXT_PUBLIC_LOCAL_GRADIENT_TILE_KEY ?? null;
  const publicBase = process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomecenter.com';

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Link href={`/inventory/${home.id}`} style={{ fontSize: 12, color: 'var(--adm-ink-mute)', textDecoration: 'none' }}>
            ← {(home as Home).name} ({(home as Home).stock_no})
          </Link>
          <h1 style={{ marginTop: 6 }}>Place on lot</h1>
          <p style={{ color: 'var(--adm-ink-mute)', fontSize: 13, marginTop: 4 }}>
            Search a buyer&rsquo;s address, drag the home footprint inside the parcel, and share the link.
          </p>
        </div>
      </div>

      {!apiKey && (
        <div style={{
          padding: 12, background: '#FFF7E6', border: '1px solid #F2D27F',
          borderRadius: 6, marginBottom: 16, fontSize: 13, color: '#7A5F0E',
        }}>
          <strong>Google Maps key not set.</strong> Add{' '}
          <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to your environment to load the map.
          Parcel lookups default to mock data unless <code>PARCEL_PROVIDER</code> is configured
          (Phase E.2 will add a free DIY county-data provider).
        </div>
      )}

      <PlacementEditor
        home={home as Home}
        existing={(existing as PropertyPlacement | null) ?? null}
        setbacks={setbacks}
        googleMapsApiKey={apiKey}
        localGradientTileKey={lgTileKey}
        publicBaseUrl={publicBase}
      />
    </>
  );
}
