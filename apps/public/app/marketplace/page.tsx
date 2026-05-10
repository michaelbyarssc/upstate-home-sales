import Link from 'next/link';
import { createPublicClient, publicPhotoUrl } from '../../lib/supabase';
import { formatCents } from '@uhs/db';

export const revalidate = 120;

type MarketplaceHome = {
  id: string;
  org_id: string;
  stock_no: string;
  name: string;
  type: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  listed_price_cents: number | null;
  prices_hidden: boolean;
  starting_from: boolean;
  org_slug: string;
  org_name: string;
  org_brand_color: string | null;
  public_home_photos?: Array<{ storage_path: string; sort_order: number }> | null;
};

export const metadata = {
  title: 'Marketplace · Manufactured homes from SC dealers',
  description: 'Browse manufactured homes for sale across multiple South Carolina dealers in one place.',
};

export default async function MarketplacePage({ searchParams }: { searchParams: { type?: string; max_price?: string } }) {
  const sb = createPublicClient();
  // Fetch from the marketplace view + photos via a separate query (the
  // view doesn't expose photos directly to keep it lean).
  let q = sb.from('public_marketplace_homes').select('*').limit(96);
  if (searchParams.type) q = q.eq('type', searchParams.type);
  if (searchParams.max_price) q = q.lte('listed_price_cents', Number(searchParams.max_price) * 100);

  const { data: homes } = await q;
  const list = (homes ?? []) as unknown as MarketplaceHome[];

  // Pull photos for the homes we got back.
  const ids = list.map((h) => h.id);
  let photoByHome: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: photos } = await sb
      .from('public_home_photos')
      .select('home_id, storage_path, sort_order')
      .in('home_id', ids)
      .order('sort_order');
    type P = { home_id: string; storage_path: string; sort_order: number };
    for (const p of (photos ?? []) as P[]) {
      if (!photoByHome[p.home_id]) photoByHome[p.home_id] = p.storage_path;
    }
  }

  return (
    <main className="section">
      <div className="inner">
        <div className="eyebrow">Marketplace</div>
        <h1 style={{ fontFamily: 'var(--f-display)', fontSize: 'var(--t-display-m)', marginTop: 'var(--s-2)' }}>
          Manufactured homes across SC dealers
        </h1>
        <p style={{ marginTop: 'var(--s-3)', color: 'var(--c-ink-soft)', maxWidth: 640 }}>
          Browse {list.length}+ homes from independent South Carolina dealers. Click a home to learn more — your inquiry routes directly to that dealer.
        </p>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 'var(--s-5)', marginTop: 'var(--s-7)',
        }}>
          {list.map((h) => {
            const photo = photoByHome[h.id] ? publicPhotoUrl(photoByHome[h.id]!) : null;
            const detail = `/marketplace/${h.org_slug}/${encodeURIComponent(h.stock_no)}`;
            const brand = h.org_brand_color ?? 'var(--c-brand)';
            return (
              <Link key={h.id} href={detail} style={{
                display: 'block', textDecoration: 'none', color: 'inherit',
                background: '#fff', border: '1px solid var(--c-line)',
                borderRadius: 'var(--r-2)', overflow: 'hidden',
              }}>
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt={h.name} style={{ width: '100%', height: 200, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: 200, background: 'var(--c-bg)' }} />
                )}
                <div style={{ padding: 14 }}>
                  <div style={{
                    fontSize: 11, color: brand, fontWeight: 500,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    {h.org_name}
                  </div>
                  <div style={{ fontWeight: 500, marginTop: 2 }}>{h.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--c-ink-mute)', marginTop: 4 }}>
                    {h.beds ?? '—'} bd · {h.baths ?? '—'} ba · {h.sqft?.toLocaleString() ?? '—'} sf
                  </div>
                  <div style={{
                    marginTop: 10, fontFamily: 'var(--f-display)',
                    fontSize: 'var(--t-h3)', fontVariantNumeric: 'tabular-nums',
                  }}>
                    {h.prices_hidden ? 'Contact for pricing' : (
                      <>{h.starting_from ? 'from ' : ''}{formatCents(h.listed_price_cents)}</>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {list.length === 0 && (
          <div style={{ marginTop: 60, textAlign: 'center', color: 'var(--c-ink-mute)' }}>
            No homes opted into the marketplace yet. Check back soon.
          </div>
        )}
      </div>
    </main>
  );
}
