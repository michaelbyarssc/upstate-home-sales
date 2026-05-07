import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createPublicClient, publicPhotoUrl } from '../../../lib/supabase';
import { QuoteForm } from './quote-form';
import { formatCents, type PublicHome, type PublicHomePhoto } from '@uhs/db';

type Params = { stock: string };

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Params }) {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('public_homes')
    .select('name, model, manufacturers(name)')
    .eq('stock_no', params.stock)
    .maybeSingle();
  if (!data) return { title: 'Not found' };
  return { title: data.name };
}

export default async function HomeDetailPage({ params }: { params: Params }) {
  const supabase = createPublicClient();
  const { data: home } = await supabase
    .from('public_homes')
    .select(
      'id, stock_no, name, model, type, beds, baths, sqft, width_ft, length_ft, year_built, construction, listed_price_cents, starting_from, headline, description, on_lot_since, manufacturer_id, manufacturers(name)'
    )
    .eq('stock_no', params.stock)
    .maybeSingle();

  if (!home) notFound();

  // Note: the .select above returns inner-joined manufacturers; PostgREST gives us {name}.
  const h = home as unknown as PublicHome & { manufacturers?: { name: string } | null };

  const { data: photos } = await supabase
    .from('public_home_photos')
    .select('id, home_id, storage_path, sort_order, alt_text, width, height')
    .eq('home_id', h.id)
    .order('sort_order');
  const heroPhoto = (photos ?? [])[0] as PublicHomePhoto | undefined;
  const heroUrl = heroPhoto ? publicPhotoUrl(heroPhoto.storage_path) : null;

  return (
    <main className="section">
      <div className="inner">
        <div style={{ marginBottom: 'var(--s-6)', fontSize: 13, color: 'var(--c-ink-mute)' }}>
          <Link href="/inventory" style={{ color: 'inherit' }}>← Inventory</Link>
          <span style={{ margin: '0 8px' }}>/</span>
          <span style={{ color: 'var(--c-ink)' }}>{h.stock_no}</span>
        </div>

        <div className="detail-grid">
          {/* LEFT — gallery + specs + description */}
          <div>
            <div className="gallery-main"
              style={heroUrl ? { backgroundImage: `url(${heroUrl})` } : undefined} />
            {(photos?.length ?? 0) > 1 && (
              <div className="gallery-thumbs">
                {(photos ?? []).slice(0, 8).map((p: { id: string; storage_path: string; alt_text: string | null }) => (
                  <button
                    key={p.id}
                    type="button"
                    style={{ backgroundImage: `url(${publicPhotoUrl(p.storage_path)})` }}
                    aria-label={p.alt_text ?? 'Photo'}
                  />
                ))}
              </div>
            )}

            <div style={{ marginTop: 'var(--s-8)' }}>
              <div className="eyebrow">{h.manufacturers?.name ?? 'Manufactured Home'}{h.model ? ` · ${h.model}` : ''}</div>
              <h1 style={{ marginTop: 8 }}>{h.name}</h1>
              {h.headline && (
                <p style={{ fontSize: 'var(--t-body-l)', color: 'var(--c-ink-soft)', marginTop: 'var(--s-3)' }}>
                  {h.headline}
                </p>
              )}
            </div>

            <div className="spec-grid">
              <div className="row"><span className="lbl">Type</span><span>{cap(h.type)}-wide</span></div>
              <div className="row"><span className="lbl">Beds / baths</span><span>{h.beds ?? '—'} / {h.baths ?? '—'}</span></div>
              <div className="row"><span className="lbl">Square feet</span><span>{h.sqft?.toLocaleString() ?? '—'}</span></div>
              <div className="row"><span className="lbl">Dimensions</span><span>{h.width_ft && h.length_ft ? `${h.width_ft}′ × ${h.length_ft}′` : '—'}</span></div>
              <div className="row"><span className="lbl">Year built</span><span>{h.year_built ?? '—'}</span></div>
              <div className="row"><span className="lbl">Construction</span><span>{h.construction ?? '—'}</span></div>
              <div className="row"><span className="lbl">Stock number</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{h.stock_no}</span></div>
              <div className="row"><span className="lbl">On the lot since</span><span>{h.on_lot_since ? new Date(h.on_lot_since).toLocaleDateString() : '—'}</span></div>
            </div>

            {h.description && (
              <div style={{ marginTop: 'var(--s-10)' }}>
                <h3 style={{ marginBottom: 'var(--s-3)' }}>About this home</h3>
                <p style={{ fontSize: 'var(--t-body-l)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{h.description}</p>
              </div>
            )}
          </div>

          {/* RIGHT — sticky quote card + modal */}
          <aside className="detail-aside">
            <QuoteForm
              homeId={h.id}
              homeName={h.name}
              stockNo={h.stock_no}
              listedPriceCents={h.listed_price_cents}
              startingFrom={h.starting_from}
              beds={h.beds}
              baths={h.baths}
              sqft={h.sqft}
              manufacturerName={h.manufacturers?.name ?? null}
              modelName={h.model}
              heroUrl={heroUrl}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
