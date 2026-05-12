import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createPublicClient, publicPhotoUrl } from '../../../../lib/supabase';
import { formatCents } from '@uhs/db';
import { VisitorTracker } from '../../../../components/VisitorTracker';

export const revalidate = 120;

type Params = { orgSlug: string; stock: string };

export default async function MarketplaceDetailPage({ params }: { params: Params }) {
  const sb = createPublicClient();
  const { data } = await sb
    .from('public_marketplace_homes')
    .select('*')
    .eq('org_slug', params.orgSlug)
    .eq('stock_no', decodeURIComponent(params.stock))
    .maybeSingle();
  if (!data) notFound();

  const home = data as {
    id: string; stock_no: string; name: string; type: string; beds: number | null;
    baths: number | null; sqft: number | null; width_ft: number | null; length_ft: number | null;
    year_built: number | null; listed_price_cents: number | null; prices_hidden: boolean;
    starting_from: boolean; headline: string | null; description: string | null;
    org_slug: string; org_name: string; org_brand_color: string | null;
  };

  // Photos for this home.
  const { data: photos } = await sb
    .from('public_home_photos')
    .select('storage_path, sort_order')
    .eq('home_id', home.id)
    .order('sort_order');
  const photoUrls = (photos ?? []).map((p) => publicPhotoUrl(p.storage_path));

  return (
    <main className="section">
      {/* Phase G — funnel; Phase I — cross-org marketplace attribution. */}
      <VisitorTracker eventType="home_view" homeId={home.id} />
      <VisitorTracker eventType="marketplace_view" homeId={home.id} />
      <div className="inner">
        <Link href="/marketplace" style={{ fontSize: 12, color: 'var(--c-ink-mute)' }}>
          ← All marketplace homes
        </Link>

        <div className="eyebrow" style={{ color: home.org_brand_color ?? 'var(--c-brand)', marginTop: 'var(--s-4)' }}>
          {home.org_name}
        </div>
        <h1 style={{ fontFamily: 'var(--f-display)', fontSize: 'var(--t-display-m)', marginTop: 'var(--s-2)' }}>
          {home.name}
        </h1>
        {home.headline && (
          <p style={{ marginTop: 'var(--s-3)', fontSize: 'var(--t-body-l)', color: 'var(--c-ink-soft)' }}>
            {home.headline}
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--s-7)', marginTop: 'var(--s-6)' }}>
          <div>
            {photoUrls.length > 0 ? (
              <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrls[0]} alt={home.name} style={{ width: '100%', borderRadius: 'var(--r-3)' }} />
                {photoUrls.length > 1 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--s-2)' }}>
                    {photoUrls.slice(1, 7).map((u, i) => (
                      // eslint-disable-next-line @next/next/no-img-element, react/no-array-index-key
                      <img key={i} src={u} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 'var(--r-2)' }} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ width: '100%', aspectRatio: '4/3', background: 'var(--c-bg)', borderRadius: 'var(--r-3)' }} />
            )}

            {home.description && (
              <p style={{ marginTop: 'var(--s-6)', whiteSpace: 'pre-wrap', color: 'var(--c-ink-soft)' }}>
                {home.description}
              </p>
            )}
          </div>

          <aside>
            <div style={{
              padding: 'var(--s-5)',
              background: '#fff',
              border: '1px solid var(--c-line)',
              borderRadius: 'var(--r-3)',
              position: 'sticky',
              top: 'var(--s-6)',
            }}>
              <div className="eyebrow">Price</div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 'var(--t-display-s)', marginTop: 'var(--s-2)' }}>
                {home.prices_hidden ? 'Contact for pricing' : (
                  <>{home.starting_from && <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--c-ink-mute)' }}>from </span>}{formatCents(home.listed_price_cents)}</>
                )}
              </div>
              <ul style={{ listStyle: 'none', margin: 'var(--s-4) 0 0', padding: 0, display: 'grid', gap: 6, fontSize: 13 }}>
                <li>{home.beds ?? '—'} bedrooms · {home.baths ?? '—'} baths</li>
                <li>{home.sqft?.toLocaleString() ?? '—'} sq ft · {home.type}</li>
                {(home.width_ft && home.length_ft) && <li>{home.width_ft} × {home.length_ft} ft</li>}
                {home.year_built && <li>Year {home.year_built}</li>}
                <li style={{ color: 'var(--c-ink-mute)', marginTop: 4 }}>Stock #{home.stock_no}</li>
              </ul>

              <div style={{ marginTop: 'var(--s-5)' }}>
                <Link
                  href={`/contact?stock=${encodeURIComponent(home.stock_no)}&source=marketplace`}
                  className="btn btn-primary"
                  style={{
                    display: 'block', width: '100%', textAlign: 'center',
                    background: home.org_brand_color ?? undefined,
                    borderColor: home.org_brand_color ?? undefined,
                  }}
                >
                  Contact {home.org_name}
                </Link>
              </div>
              <div style={{ marginTop: 'var(--s-3)', fontSize: 11, color: 'var(--c-ink-mute)', textAlign: 'center' }}>
                Your inquiry routes directly to the listing dealer.
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
