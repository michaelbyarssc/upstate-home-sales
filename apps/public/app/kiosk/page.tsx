import Link from 'next/link';
import { createPublicClient, publicPhotoUrl } from '../../lib/supabase';
import { formatCompactPrice, formatMonthly } from '../../lib/finance';
import type { PublicHome } from '@uhs/db';

export const revalidate = 60;
export const metadata = { title: 'Kiosk · Upstate Home Sales' };

type KHome = PublicHome & {
  manufacturers?: { name: string } | null;
  public_home_photos?: Array<{ storage_path: string; sort_order: number }> | null;
};

export default async function KioskHome() {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('public_homes')
    .select(
      'id, stock_no, name, model, type, beds, baths, sqft, width_ft, length_ft, listed_price_cents, prices_hidden, starting_from, on_lot_since, is_featured, manufacturer_id, manufacturers(name), public_home_photos(storage_path, sort_order)'
    )
    .order('is_featured', { ascending: false })
    .order('on_lot_since', { ascending: false, nullsFirst: false })
    .limit(24);
  const homes = (data ?? []) as unknown as KHome[];

  return (
    <>
      <KioskBar />
      <main className="kiosk-content">
        <div style={{ marginBottom: 12 }}>
          <div className="eyebrow" style={{ color: 'var(--c-ink-mute)' }}>Browse</div>
          <h1 style={{ fontSize: 'var(--t-display-xl)', marginTop: 6 }}>Tap a home to see details.</h1>
          <p style={{ fontSize: 18, color: 'var(--c-ink-soft)', marginTop: 8 }}>
            Take your time — a salesperson is happy to walk through any home with you.
          </p>
        </div>

        <div className="kiosk-grid">
          {homes.map((h) => {
            const photo = h.public_home_photos?.[0];
            const url = photo ? publicPhotoUrl(photo.storage_path) : null;
            const specs = [
              h.beds != null ? `${h.beds} Bed` : null,
              h.baths != null ? `${h.baths} Bath` : null,
              h.sqft ? `${h.sqft.toLocaleString()} Sq Ft` : null,
            ].filter(Boolean).join('  |  ');
            return (
              <Link
                key={h.id}
                href={`/kiosk/${encodeURIComponent(h.stock_no)}`}
                className="kiosk-card"
              >
                <div className="photo" style={url ? { backgroundImage: `url(${url})` } : undefined} />
                <div className="body">
                  <div className="name">{h.name}</div>
                  {h.prices_hidden || h.listed_price_cents == null ? (
                    <div className="price" style={{ fontSize: 18, color: 'var(--c-ink-mute)', fontWeight: 500 }}>
                      Contact for pricing
                    </div>
                  ) : (
                    <div className="price">
                      {formatCompactPrice(h.listed_price_cents)}{' '}
                      <span style={{ fontSize: 16, color: 'var(--c-ink-mute)', fontWeight: 500 }}>
                        | {formatMonthly(h.listed_price_cents)}
                      </span>
                    </div>
                  )}
                  <div className="specs">{specs}</div>
                  <div className="tap">Tap to view</div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}

function KioskBar() {
  return (
    <div className="kiosk-bar">
      <Link href="/kiosk" className="brand">
        Upstate Home <em>Sales</em>
      </Link>
      <div className="right">
        <span style={{ opacity: 0.7, fontSize: 14 }}>Need help? Find a salesperson.</span>
        <a className="phone" href="tel:864-680-4030">(864) 680-4030</a>
      </div>
    </div>
  );
}
