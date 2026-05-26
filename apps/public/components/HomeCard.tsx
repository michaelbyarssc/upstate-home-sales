import Link from 'next/link';
import { type PublicHome, formatBedsOrBaths } from '@uhs/db';
import { publicPhotoUrl } from '../lib/supabase';
import { formatCompactPrice, formatMonthly } from '../lib/finance';
import { CompareToggle } from './CompareToggle';

type Props = {
  home: PublicHome & {
    manufacturers?: { name: string } | null;
    public_home_photos?: Array<{ storage_path: string; sort_order: number }> | null;
  };
  index?: number;
};

/**
 * Inventory card. Layout matches the BuildTrove dealer-site aesthetic:
 * large photo top, name + price/mo header, pipe-separated spec line,
 * dual CTAs (View details + Design home).
 *
 * The "Design home" route (Phase C) doesn't exist yet, so it deep-links
 * to the detail page with a #design hash that the detail page can later
 * scroll to.
 */
export function HomeCard({ home, index = 0 }: Props) {
  const photo = home.public_home_photos?.[0];
  const phClass = `ph-${(index % 9) + 1}`;
  const isNew = home.on_lot_since
    ? Math.floor((Date.now() - new Date(home.on_lot_since).getTime()) / 86_400_000) <= 14
    : false;

  const detailHref = `/inventory/${encodeURIComponent(home.stock_no)}`;
  const designHref = `${detailHref}#design`;

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

  const pricesHidden = home.prices_hidden || home.listed_price_cents == null;
  const compactPrice = pricesHidden ? null : formatCompactPrice(home.listed_price_cents);
  const monthly = pricesHidden ? null : formatMonthly(home.listed_price_cents);

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
          {pricesHidden ? (
            <div className="home-card-price" style={{ color: 'var(--c-ink-mute)', fontWeight: 500, fontSize: 13 }}>
              Contact for pricing
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

        <div className="home-card-ctas">
          <Link href={detailHref} className="home-card-btn">
            View details
          </Link>
          <Link href={designHref} className="home-card-btn">
            Design home
          </Link>
        </div>
      </div>
    </article>
  );
}
