import Link from 'next/link';
import { createPublicClient, fetchDesignReadyIds } from '../../lib/supabase';
import { HomeCard } from '../../components/HomeCard';
import type { PublicHome } from '@uhs/db';
import { absoluteUrl, itemListSchema } from '../../lib/seo';
import { DeliveryZoneCheck } from '../../components/DeliveryZoneCheck';
import { VisitorTracker } from '../../components/VisitorTracker';
import { SmartSearchBar } from '../../components/SmartSearchBar';
import { InventoryFilters } from '../../components/InventoryFilters';

export const metadata = { title: 'Available Homes' };
export const dynamic = 'force-dynamic';

type SearchParams = {
  type?: string;
  mfr?: string;
  q?: string;
  price?: string;
  beds?: string;
  baths?: string;
  min_price?: string;
  max_price?: string;
  min_sqft?: string;
  max_sqft?: string;
};

const SQFT_BANDS: Array<{ label: string; min: number; max: number | null }> = [
  { label: '1,800+ sq. ft.', min: 1800, max: null },
  { label: '1,200 - 1,800 sq. ft.', min: 1200, max: 1800 },
  { label: '750 - 1,200 sq. ft.', min: 750, max: 1200 },
  { label: '750 sq. ft. and below', min: 0, max: 750 },
];

export default async function InventoryListPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createPublicClient();
  const { type, mfr, q, price, beds, baths, min_price, max_price, min_sqft, max_sqft } = searchParams;

  let mfrId: string | null = null;
  if (mfr) {
    const { data } = await supabase.from('manufacturers').select('id').eq('slug', mfr).maybeSingle();
    mfrId = data?.id ?? null;
  }

  // Org-wide price visibility. There's no public_orgs view — the flag rides on
  // every public_homes row, so probe one. When the dealer hides prices the view
  // nulls listed_price_cents for anon, and price filters would match nothing;
  // skip them entirely and hide the price UI instead.
  const { data: priceProbe } = await supabase
    .from('public_homes')
    .select('prices_hidden')
    .limit(1)
    .maybeSingle();
  const pricesVisible = !(priceProbe?.prices_hidden ?? false);

  let query = supabase
    .from('public_homes')
    .select(
      'id, stock_no, name, model, type, beds, baths, beds_options, baths_options, sqft, width_ft, length_ft, listed_price_cents, prices_hidden, starting_from, on_lot_since, is_featured, manufacturer_id, manufacturers(name), public_home_photos(storage_path, sort_order)'
    )
    .order('is_featured', { ascending: false })
    .order('on_lot_since', { ascending: false, nullsFirst: false })
    .limit(96);
  if (type) query = query.eq('type', type);
  if (mfrId) query = query.eq('manufacturer_id', mfrId);
  if (q) query = query.or(`name.ilike.%${q}%,model.ilike.%${q}%`);

  // Explicit min/max price (from the parser) wins over the legacy bucket dropdown.
  // Only applied while prices are visible — stale URLs / smart-search price terms
  // must not strand visitors on zero results when the dealer hides prices.
  if (pricesVisible) {
    const hasExplicitPrice = min_price != null || max_price != null;
    if (hasExplicitPrice) {
      if (min_price != null) {
        const n = parseInt(min_price, 10);
        if (Number.isFinite(n)) query = query.gte('listed_price_cents', n * 100);
      }
      if (max_price != null) {
        const n = parseInt(max_price, 10);
        if (Number.isFinite(n)) query = query.lte('listed_price_cents', n * 100);
      }
    } else if (price === 'u100') query = query.lt('listed_price_cents', 10_000_000);
    else if (price === '100-200')
      query = query.gte('listed_price_cents', 10_000_000).lt('listed_price_cents', 20_000_000);
    else if (price === 'o200') query = query.gte('listed_price_cents', 20_000_000);
  }

  // Beds — match primary beds OR configurable beds_options array.
  if (beds != null) {
    const n = parseInt(beds, 10);
    if (Number.isFinite(n)) query = query.or(`beds.eq.${n},beds_options.cs.{${n}}`);
  }
  if (baths != null) {
    const n = parseFloat(baths);
    if (Number.isFinite(n)) query = query.or(`baths.eq.${n},baths_options.cs.{${n}}`);
  }

  if (min_sqft != null) {
    const n = parseInt(min_sqft, 10);
    if (Number.isFinite(n)) query = query.gte('sqft', n);
  }
  if (max_sqft != null) {
    const n = parseInt(max_sqft, 10);
    if (Number.isFinite(n)) query = query.lte('sqft', n);
  }

  const [{ data: rows }, { data: manufacturers }, { data: collections }] = await Promise.all([
    query,
    supabase.from('manufacturers').select('id, slug, name').order('name'),
    supabase
      .from('public_collections')
      .select('slug, name, sort_order')
      .order('sort_order')
      .order('name')
      .limit(8),
  ]);
  const homes = (rows ?? []) as unknown as PublicHome[];
  const cols = (collections ?? []) as Array<{ slug: string; name: string; sort_order: number }>;

  // Which of these homes' models have Design Studio content (gates the CTA).
  const designReady = await fetchDesignReadyIds(supabase, homes.map((h) => h.id));

  // Group homes into sqft bands so the listing reads like Trove's catalog.
  const grouped = SQFT_BANDS.map((band) => ({
    band,
    homes: homes.filter((h) => {
      const s = h.sqft ?? 0;
      if (s < band.min) return false;
      if (band.max != null && s >= band.max) return false;
      return true;
    }),
  })).filter((g) => g.homes.length > 0);

  // Anything with no sqft data ends up here so we still show it.
  const ungrouped = homes.filter((h) => !h.sqft);

  const itemListJsonLd = itemListSchema(
    homes.map((h) => ({
      url: absoluteUrl(`/inventory/${encodeURIComponent(h.stock_no)}`),
      name: h.name,
    })),
  );

  return (
    <main className="section">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: itemListJsonLd }} />
      <VisitorTracker eventType="inventory_view" />
      <div className="inner">
        <nav className="inv-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className="sep">›</span>
          <span className="current">Available Homes</span>
        </nav>

        <div className="section-head">
          <div className="lhs">
            <h2>Our homes</h2>
            <p style={{ color: 'var(--c-ink-mute)', marginTop: 8 }}>
              {homes.length} listings · prices update live · come see them on the lot.
            </p>
          </div>
        </div>

        <DeliveryZoneCheck />

        {cols.length > 0 && (
          <div className="collection-chips" aria-label="Collections">
            {cols.map((c) => (
              <Link key={c.slug} href={`/inventory/collection/${c.slug}`}>
                {c.name}
              </Link>
            ))}
          </div>
        )}

        <form className="filter-bar" method="GET" action="/inventory">
          <InventoryFilters
            type={type}
            mfr={mfr}
            price={price}
            manufacturers={(manufacturers ?? []) as Array<{ id: string; slug: string; name: string }>}
            showPriceFilter={pricesVisible}
          />
          <SmartSearchBar
            defaultValue={q ?? ''}
            manufacturers={(manufacturers ?? []).map((m) => ({ slug: m.slug, name: m.name }))}
            pricesHidden={!pricesVisible}
          />
          {(type || mfr || q || price || beds || baths || min_price || max_price || min_sqft || max_sqft) && (
            <Link href="/inventory" className="btn btn-ghost btn-sm">Clear</Link>
          )}
          <span className="results"><strong>{homes.length}</strong> match</span>
        </form>

        {homes.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid var(--c-line)', borderRadius: 'var(--r-2)', padding: 60, textAlign: 'center' }}>
            <h3>No homes match those filters</h3>
            <p style={{ color: 'var(--c-ink-mute)', marginTop: 8 }}>
              Try clearing some filters, or <Link href="/contact">give us a call</Link> — we may have more inbound.
            </p>
          </div>
        ) : (
          <>
            {grouped.map(({ band, homes: bandHomes }) => (
              <section key={band.label} className="inv-sqft-group">
                <h3 className="inv-sqft-heading">{band.label}</h3>
                <div className="inv-grid-public">
                  {bandHomes.map((h, i) => (
                    <HomeCard key={h.id} home={h} index={i} designReady={designReady.has(h.id)} />
                  ))}
                </div>
              </section>
            ))}
            {ungrouped.length > 0 && (
              <section className="inv-sqft-group">
                <h3 className="inv-sqft-heading">Other</h3>
                <div className="inv-grid-public">
                  {ungrouped.map((h, i) => (
                    <HomeCard key={h.id} home={h} index={i} designReady={designReady.has(h.id)} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
