import Link from 'next/link';
import { type PublicHome, formatBedsOrBaths } from '@uhs/db';
import { publicPhotoUrl } from '../lib/supabase';
import { formatCompactPrice, formatMonthly, priceFallbackLabel } from '../lib/finance';
import { CompareToggle } from './CompareToggle';

type Props = {
  home: PublicHome & {
    manufacturers?: { name: string } | null;
    public_home_photos?: Array<{ storage_path: string; sort_order: number }> | null;
  };
  index?: number;
  /** Show the "Design home" CTA — true when the home's model has Studio content. */
  designReady?: boolean;
};

/**
 * Inventory card. Layout matches the BuildTrove dealer-site aesthetic:
 * large photo top, name + price/mo header, pipe-separated spec line, CTAs.
 *
 * "Design home" opens the 3D Design Studio at /inventory/[stock]/design.
 * It only renders when the home's model has authored content (designReady);
 * otherwise "View details" spans the full width.
 */
export function HomeCard({ home, index = 0, designReady = false }: Props) {
  const photo = home.public_home_photos?.[0];
  const phClass = `ph-${(index % 9) + 1}`;
  const isNew = home.on_lot_since
    ? Math.floor((Date.now() - new Date(home.on_lot_since).getTime()) / 86_400_000) <= 14
    : false;

  const detailHref = `/inventory/${encodeURIComponent(home.stock_no)}`;
  const designHref = `${detailHref}/design`;

  const isConfigurable =
    (home.beds_options && home.beds_options.length > 1) ||
    (home.baths_options && home.baths_options.length > 1);

  const specBits: string[] = [];
  const bedsStr = formatBedsOrBaths(home.beds, home.beds_options);
  const bathsStr = formatBedsOrBaths(home.baths, home.baths_options);
  if (bedsStr !== '\u2014') specBits.push(`${bedsStr} Bed`);
  if (bathsStr !== '\u2014') specBits.push(`${bathsStr} Bath`);
  if (home.sqft) specBits.push(`${home.sqft.toLocaleString()} Sq. Ft.`);
  if (home.width_ft && home.length_ft) specBits.push(`${home.width_ft}' × ${home.length_ft}'`);

  const priceFallback = priceFallbackLabel(home);
  const compactPrice = priceFallback ? null : formatCompactPrice(home.listed_price_cents);
  const monthly = priceFallback ? null : formatMonthly(home.listed_price_cents);

  return (
    <article className="home-card">
      <Link href={detailHref} className="home-card-photo" aria-label={home.name}>
        {photo ? (
          <div
            className="placeholder"
            style={{
              backgroundImage: `url(${publicPhotoUrl(photo.storage_path)})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        ) : (
          <div className={`placeholder ${phClass}`}>{home.manufacturers?.name ?? 'Photo'}</div>
        )}
        {isNew && <span className="badge new">New</span>}
        {home.is_featured && !isNew && <span className="badge">Featured</span>}
        {isConfigurable && (
          <span className={`badge configurable${isNew || home.is_featured ? ' stacked' : ''}`}>
            Configurable
          </span>
        )}
        <CompareToggle stock_no={home.stock_no} name={home.name} />
      </Link>

      <div className="home-card-body">
        <div className="home-card-head">
          <Link href={detailHref} className="home-card-name">
            {home.name}
          </Link>
          {priceFallback ? (
            <div className="home-card-price" style={{ color: 'var(--c-ink-mute)', fontWeight: 500, fontSize: 13 }}>
              {priceFallback}
            </div>
          ) : (
            <div className="home-card-price">
              <span className="total">{compactPrice}</span>
              <span className="sep">|</span>
              <span className="monthly">{monthly}</span>
            </div>
          )}
        </div>

        <div className="home-card-specs">
          {specBits.length > 0 ? specBits.join(' | ') : '—'}
        </div>

        <div className={`home-card-ctas${designReady ? '' : ' single'}`}>
          <Link href={detailHref} className="home-card-btn">
            View details
          </Link>
          {designReady && (
            <Link href={designHref} className="home-card-btn">
              Design home
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
