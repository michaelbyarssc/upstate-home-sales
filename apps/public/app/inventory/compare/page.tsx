import Link from 'next/link';
import { createPublicClient, publicPhotoUrl } from '../../../lib/supabase';
import { formatCompactPrice, formatMonthly } from '../../../lib/finance';
import type { PublicHome } from '@uhs/db';

export const metadata = { title: 'Compare homes' };
export const revalidate = 60;

type SearchParams = { ids?: string };

const MAX_COMPARE = 4;

type CompareHome = PublicHome & {
  manufacturers?: { name: string } | null;
  public_home_photos?: Array<{ storage_path: string; sort_order: number }> | null;
};

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createPublicClient();
  const stocks = (searchParams.ids ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_COMPARE);

  let homes: CompareHome[] = [];
  if (stocks.length > 0) {
    const { data } = await supabase
      .from('public_homes')
      .select(
        'id, stock_no, name, model, type, beds, baths, sqft, width_ft, length_ft, year_built, construction, listed_price_cents, prices_hidden, starting_from, headline, description, on_lot_since, manufacturer_id, manufacturers(name), public_home_photos(storage_path, sort_order)'
      )
      .in('stock_no', stocks);
    // Preserve the URL order so users see what they selected, not whatever Postgres returns.
    const byStock = new Map((data ?? []).map((h: any) => [h.stock_no, h as CompareHome]));
    homes = stocks.map((s) => byStock.get(s)).filter((h): h is CompareHome => !!h);
  }

  if (homes.length === 0) {
    return (
      <main className="section">
        <div className="inner section-text">
          <nav className="inv-breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span className="sep">›</span>
            <Link href="/inventory">Inventory</Link>
            <span className="sep">›</span>
            <span className="current">Compare</span>
          </nav>
          <div className="eyebrow">Compare</div>
          <h1 style={{ marginTop: 'var(--s-3)' }}>Stack two or more homes side by side.</h1>
          <p style={{ fontSize: 'var(--t-body-l)', marginTop: 'var(--s-4)', color: 'var(--c-ink-soft)' }}>
            Pick up to {MAX_COMPARE} homes from the inventory and compare specs head-to-head. Click the <strong>Compare</strong>
            chip on any home card to add it to your comparison.
          </p>
          <div style={{ marginTop: 'var(--s-6)' }}>
            <Link href="/inventory" className="btn btn-primary">Browse inventory →</Link>
          </div>
        </div>
      </main>
    );
  }

  // Numeric helpers — find the cheapest, most spacious, etc., to highlight winners.
  const min = (vals: Array<number | null | undefined>) => {
    const ns = vals.filter((v): v is number => v != null);
    return ns.length ? Math.min(...ns) : null;
  };
  const max = (vals: Array<number | null | undefined>) => {
    const ns = vals.filter((v): v is number => v != null);
    return ns.length ? Math.max(...ns) : null;
  };
  const minPrice = min(homes.map((h) => h.listed_price_cents));
  const maxSqft = max(homes.map((h) => h.sqft));
  const maxBeds = max(homes.map((h) => h.beds));
  const maxBaths = max(homes.map((h) => h.baths));

  function bestPill(isBest: boolean) {
    return isBest ? <span className="best-pill">Best</span> : null;
  }

  return (
    <main className="section">
      <div className="inner">
        <nav className="inv-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className="sep">›</span>
          <Link href="/inventory">Inventory</Link>
          <span className="sep">›</span>
          <span className="current">Compare</span>
        </nav>

        <div className="section-head">
          <div className="lhs">
            <div className="eyebrow">Compare</div>
            <h2>{homes.length} home{homes.length === 1 ? '' : 's'} side by side</h2>
            <p style={{ color: 'var(--c-ink-mute)', marginTop: 8 }}>
              Highlights show the best value in each row. Tap any column header to view the full listing.
            </p>
          </div>
        </div>

        <div className="compare-table">
          {/* Header row: photos + names */}
          <div className="compare-row compare-row-head">
            <div className="compare-label" />
            {homes.map((h) => {
              const photo = h.public_home_photos?.[0];
              const url = photo ? publicPhotoUrl(photo.storage_path) : null;
              return (
                <div key={h.id} className="compare-col-head">
                  <Link href={`/inventory/${encodeURIComponent(h.stock_no)}`} className="compare-photo">
                    {url ? (
                      <div style={{ backgroundImage: `url(${url})` }} />
                    ) : (
                      <div className="ph-2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 11, letterSpacing: 0.16, textTransform: 'uppercase' }}>
                        {h.manufacturers?.name ?? 'Photo'}
                      </div>
                    )}
                  </Link>
                  <Link href={`/inventory/${encodeURIComponent(h.stock_no)}`} className="compare-name">
                    {h.name}
                  </Link>
                  <div className="compare-sub">
                    {h.manufacturers?.name ?? 'Manufactured Home'}
                    {h.model ? ` · ${h.model}` : ''}
                  </div>
                </div>
              );
            })}
          </div>

          <CompareRow
            label="Price"
            cells={homes.map((h) => (
              h.prices_hidden || h.listed_price_cents == null ? (
                <span style={{ color: 'var(--c-ink-mute)', fontSize: 13 }}>Contact for pricing</span>
              ) : (
                <span style={{ fontWeight: 600 }}>
                  {formatCompactPrice(h.listed_price_cents)}
                  {bestPill(minPrice != null && h.listed_price_cents === minPrice)}
                </span>
              )
            ))}
          />
          <CompareRow
            label="Est. monthly"
            cells={homes.map((h) => (
              h.prices_hidden || h.listed_price_cents == null
                ? <span style={{ color: 'var(--c-ink-mute)' }}>—</span>
                : <span>{formatMonthly(h.listed_price_cents)}</span>
            ))}
          />
          <CompareRow
            label="Beds"
            cells={homes.map((h) => (
              <span>
                {h.beds ?? '—'}
                {bestPill(maxBeds != null && h.beds === maxBeds && (homes.length > 1))}
              </span>
            ))}
          />
          <CompareRow
            label="Baths"
            cells={homes.map((h) => (
              <span>
                {h.baths ?? '—'}
                {bestPill(maxBaths != null && h.baths === maxBaths && (homes.length > 1))}
              </span>
            ))}
          />
          <CompareRow
            label="Square feet"
            cells={homes.map((h) => (
              <span>
                {h.sqft?.toLocaleString() ?? '—'}
                {bestPill(maxSqft != null && h.sqft === maxSqft && (homes.length > 1))}
              </span>
            ))}
          />
          <CompareRow
            label="Dimensions"
            cells={homes.map((h) => (
              <span>{h.width_ft && h.length_ft ? `${h.width_ft}′ × ${h.length_ft}′` : '—'}</span>
            ))}
          />
          <CompareRow
            label="Type"
            cells={homes.map((h) => <span>{cap(h.type)}-wide</span>)}
          />
          <CompareRow
            label="Year built"
            cells={homes.map((h) => <span>{h.year_built ?? '—'}</span>)}
          />
          <CompareRow
            label="Construction"
            cells={homes.map((h) => <span>{h.construction ?? '—'}</span>)}
          />
          <CompareRow
            label="On the lot since"
            cells={homes.map((h) => (
              <span>{h.on_lot_since ? new Date(h.on_lot_since).toLocaleDateString() : '—'}</span>
            ))}
          />
          <CompareRow
            label="Stock #"
            cells={homes.map((h) => (
              <span style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>
                {h.stock_no}
              </span>
            ))}
          />

          {/* CTA row at the bottom */}
          <div className="compare-row compare-row-cta">
            <div className="compare-label" />
            {homes.map((h) => (
              <div key={h.id} className="compare-cell">
                <Link
                  href={`/inventory/${encodeURIComponent(h.stock_no)}`}
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  View details
                </Link>
              </div>
            ))}
          </div>
        </div>

        <p style={{ marginTop: 'var(--s-6)', fontSize: 13, color: 'var(--c-ink-mute)' }}>
          Want to compare different homes? <Link href="/inventory">Pick from inventory →</Link>
        </p>
      </div>
    </main>
  );
}

function CompareRow({ label, cells }: { label: string; cells: React.ReactNode[] }) {
  return (
    <div className="compare-row">
      <div className="compare-label">{label}</div>
      {cells.map((c, i) => (
        <div key={i} className="compare-cell">{c}</div>
      ))}
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
