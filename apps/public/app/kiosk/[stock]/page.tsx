import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createPublicClient, publicPhotoUrl } from '../../../lib/supabase';
import { formatCompactPrice, formatMonthly } from '../../../lib/finance';
import { type PublicHome, type PublicHomePhoto } from '@uhs/db';
import { KioskContactForm } from './kiosk-contact-form';

type Params = { stock: string };
export const revalidate = 60;
export const metadata = { title: 'Kiosk · Home detail' };

export default async function KioskHomeDetail({ params }: { params: Params }) {
  const supabase = createPublicClient();
  const { data: home } = await supabase
    .from('public_homes')
    .select(
      'id, stock_no, name, model, type, beds, baths, sqft, width_ft, length_ft, year_built, construction, listed_price_cents, prices_hidden, starting_from, headline, description, on_lot_since, manufacturer_id, manufacturers(name)'
    )
    .eq('stock_no', decodeURIComponent(params.stock))
    .maybeSingle();

  if (!home) notFound();
  const h = home as unknown as PublicHome & { manufacturers?: { name: string } | null };

  const { data: photos } = await supabase
    .from('public_home_photos')
    .select('id, home_id, storage_path, sort_order')
    .eq('home_id', h.id)
    .order('sort_order');
  const allPhotos = (photos ?? []) as PublicHomePhoto[];
  const heroUrl = allPhotos[0] ? publicPhotoUrl(allPhotos[0].storage_path) : null;

  return (
    <>
      <div className="kiosk-bar">
        <Link href="/kiosk" className="brand">Upstate Home <em>Center</em></Link>
        <div className="right">
          <Link href="/kiosk" style={{ opacity: 0.85, fontSize: 16 }}>← Back to all homes</Link>
          <a className="phone" href="tel:864-680-4030">(864) 680-4030</a>
        </div>
      </div>

      <main className="kiosk-content">
        <div className="kiosk-detail-grid">
          <div>
            <div
              className="kiosk-detail-photo"
              style={heroUrl ? { backgroundImage: `url(${heroUrl})` } : undefined}
            />
            {allPhotos.length > 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12 }}>
                {allPhotos.slice(1, 5).map((p) => (
                  <div
                    key={p.id}
                    style={{
                      aspectRatio: '4/3',
                      borderRadius: 'var(--r-2)',
                      backgroundImage: `url(${publicPhotoUrl(p.storage_path)})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  />
                ))}
              </div>
            )}

            <div style={{ marginTop: 24 }}>
              <div className="eyebrow" style={{ color: 'var(--c-ink-mute)' }}>
                {h.manufacturers?.name ?? 'Manufactured Home'}{h.model ? ` · ${h.model}` : ''}
              </div>
              <h1 style={{ fontSize: 'var(--t-display-l)', marginTop: 8 }}>{h.name}</h1>
              {h.headline && (
                <p style={{ fontSize: 20, color: 'var(--c-ink-soft)', marginTop: 12 }}>{h.headline}</p>
              )}
              {h.description && (
                <p style={{ fontSize: 16, lineHeight: 1.6, marginTop: 16, whiteSpace: 'pre-wrap', color: 'var(--c-ink)' }}>
                  {h.description}
                </p>
              )}
            </div>
          </div>

          <aside className="kiosk-detail-aside">
            <h2>{h.name}</h2>
            {h.prices_hidden || h.listed_price_cents == null ? (
              <div className="price" style={{ fontSize: 22, color: 'var(--c-ink-mute)' }}>
                Contact for pricing
              </div>
            ) : (
              <div className="price">
                {h.starting_from ? 'From ' : ''}{formatCompactPrice(h.listed_price_cents)}
                <span style={{ fontSize: 16, color: 'var(--c-ink-mute)', fontWeight: 500, marginLeft: 8 }}>
                  | {formatMonthly(h.listed_price_cents)}
                </span>
              </div>
            )}
            <ul className="specs" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {h.beds != null && <li><span className="icon">🛏</span>{h.beds} bedroom{h.beds === 1 ? '' : 's'}</li>}
              {h.baths != null && <li><span className="icon">🛁</span>{h.baths} bathroom{h.baths === 1 ? '' : 's'}</li>}
              {h.sqft != null && <li><span className="icon">↔</span>{h.sqft.toLocaleString()} sq. ft.</li>}
              {h.width_ft && h.length_ft && <li><span className="icon">▭</span>{h.width_ft}&prime; × {h.length_ft}&prime;</li>}
              <li><span className="icon">#</span>Stock {h.stock_no}</li>
            </ul>

            <div style={{ borderTop: '1px solid var(--c-line)', paddingTop: 16, marginTop: 4 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Get in touch</h3>
              <p style={{ fontSize: 14, color: 'var(--c-ink-mute)', marginBottom: 0 }}>
                Leave your name & number — a salesperson will follow up. Or grab one on the lot.
              </p>
              <KioskContactForm homeId={h.id} stockNo={h.stock_no} homeName={h.name} />
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
