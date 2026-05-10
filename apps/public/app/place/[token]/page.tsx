import Link from 'next/link';
import { createPublicClient } from '../../../lib/supabase';
import type { PublicPropertyPlacement } from '@uhs/db';
import { PlacementViewer } from './placement-viewer';
import './place.css';

type Params = { token: string };

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Params }) {
  const sb = createPublicClient();
  const { data } = await sb
    .from('public_property_placements')
    .select('label, address, org_name')
    .eq('share_token', params.token)
    .maybeSingle();
  if (!data) return { title: 'Property placement' };
  return {
    title: `${data.label ?? data.address ?? 'Property placement'} · ${data.org_name}`,
  };
}

export default async function PlaceSharePage({ params }: { params: Params }) {
  const sb = createPublicClient();
  const { data } = await sb
    .from('public_property_placements')
    .select('*')
    .eq('share_token', params.token)
    .maybeSingle();

  if (!data) {
    return (
      <main style={{ padding: '120px 24px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--f-display)' }}>Placement not found</h1>
        <p style={{ marginTop: 12, color: 'var(--c-ink-mute)' }}>
          This share link may have been revoked. Please contact your salesperson for a fresh link.
        </p>
        <Link href="/" className="btn btn-secondary" style={{ marginTop: 24 }}>← Home</Link>
      </main>
    );
  }

  const placement = data as PublicPropertyPlacement;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;

  return (
    <main className="section" style={{ paddingTop: 'var(--s-6)' }}>
      <div className="inner">
        <header style={{
          background: '#fff',
          border: '1px solid var(--c-line)',
          borderRadius: 'var(--r-3)',
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            padding: 'var(--s-6) var(--s-6)',
            background: placement.org_brand_color ?? 'var(--c-bg)',
            color: placement.org_brand_color ? '#fff' : 'var(--c-ink)',
          }}>
            <div className="eyebrow" style={{ color: placement.org_brand_color ? 'rgba(255,255,255,0.8)' : 'var(--c-ink-mute)' }}>
              {placement.org_name}
            </div>
            <h1 style={{
              marginTop: 6, fontSize: 'var(--t-h1)',
              color: placement.org_brand_color ? '#fff' : 'var(--c-ink)',
            }}>
              {placement.label ?? placement.address ?? 'Your property placement'}
            </h1>
            {placement.home_name && (
              <p style={{ marginTop: 6, color: placement.org_brand_color ? 'rgba(255,255,255,0.85)' : 'var(--c-ink-soft)' }}>
                {placement.home_name}
                {placement.home_stock_no && <> · {placement.home_stock_no}</>}
              </p>
            )}
          </div>
        </header>

        <PlacementViewer placement={placement} googleMapsApiKey={apiKey} />

        <section style={{
          marginTop: 16,
          padding: 'var(--s-6)',
          background: '#fff',
          border: '1px solid var(--c-line)',
          borderRadius: 'var(--r-3)',
        }}>
          <h3 style={{ marginBottom: 'var(--s-3)' }}>About this placement</h3>
          <div className="spec-grid">
            {placement.address && (
              <div className="row"><span className="lbl">Address</span><span>{placement.address}</span></div>
            )}
            {placement.county && (
              <div className="row"><span className="lbl">County</span><span>{placement.county}</span></div>
            )}
            <div className="row"><span className="lbl">Footprint</span><span>{placement.footprint_w_ft} × {placement.footprint_l_ft} ft</span></div>
            <div className="row"><span className="lbl">Orientation</span><span>{placement.orientation_deg}°</span></div>
            {placement.home_beds != null && (
              <div className="row"><span className="lbl">Beds / baths</span><span>{placement.home_beds} / {placement.home_baths ?? '—'}</span></div>
            )}
            {placement.home_sqft != null && (
              <div className="row"><span className="lbl">Square feet</span><span>{placement.home_sqft.toLocaleString()}</span></div>
            )}
          </div>

          <div style={{ marginTop: 'var(--s-5)', fontSize: 13, color: 'var(--c-ink-mute)' }}>
            The shaded zone shows the local setback (front {placement.setback_front_ft}ft · side{' '}
            {placement.setback_side_ft}ft · rear {placement.setback_rear_ft}ft). The home must
            sit outside that zone. Final placement is subject to county approval.
          </div>

          <div style={{ marginTop: 'var(--s-6)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/contact" className="btn btn-primary">Contact us</Link>
            <Link href="/financing" className="btn btn-secondary">Pre-qualify</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
