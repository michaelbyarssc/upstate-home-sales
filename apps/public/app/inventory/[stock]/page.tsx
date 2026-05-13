import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createPublicClient, publicPhotoUrl } from '../../../lib/supabase';
import { QuoteForm } from './quote-form';
import { Gallery } from './gallery';
import { type PublicHome, type PublicHomePhoto } from '@uhs/db';
import { absoluteUrl, homeProductSchema } from '../../../lib/seo';
import { HomeCard } from '../../../components/HomeCard';
import { VisitorTracker } from '../../../components/VisitorTracker';
import { RecentlyViewedRecorder } from './recently-viewed';

type Params = { stock: string };

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { stock } = await params;
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('public_homes')
    .select('name, model, manufacturers(name)')
    .eq('stock_no', decodeURIComponent(stock))
    .maybeSingle();
  if (!data) return { title: 'Not found' };
  return { title: data.name };
}

export default async function HomeDetailPage({ params }: { params: Promise<Params> }) {
  const { stock } = await params;
  const supabase = createPublicClient();
  const { data: home } = await supabase
    .from('public_homes')
    .select(
      'id, stock_no, name, model, type, beds, baths, sqft, width_ft, length_ft, year_built, construction, listed_price_cents, prices_hidden, starting_from, headline, description, on_lot_since, manufacturer_id, manufacturers(name)'
    )
    .eq('stock_no', decodeURIComponent(stock))
    .maybeSingle();

  if (!home) notFound();

  const h = home as unknown as PublicHome & { manufacturers?: { name: string } | null };

  const { data: photos } = await supabase
    .from('public_home_photos')
    .select('id, home_id, storage_path, sort_order, alt_text, width, height')
    .eq('home_id', h.id)
    .order('sort_order');
  const allPhotos = (photos ?? []) as PublicHomePhoto[];
  const galleryPhotos = allPhotos.map((p) => ({
    id: p.id,
    url: publicPhotoUrl(p.storage_path),
    alt: p.alt_text ?? h.name,
  }));
  const heroUrl = galleryPhotos[0]?.url ?? null;

  // ─── Smart recommendations ──────────────────────────────────────────────
  // Score nearby homes by manufacturer match → type match → price-band match.
  // Pull a candidate set, exclude the current home, sort in JS by score, take top 4.
  const priceLo = h.listed_price_cents ? Math.round(h.listed_price_cents * 0.7) : 0;
  const priceHi = h.listed_price_cents ? Math.round(h.listed_price_cents * 1.3) : Number.MAX_SAFE_INTEGER;
  const { data: candidates } = await supabase
    .from('public_homes')
    .select(
      'id, stock_no, name, model, type, beds, baths, sqft, width_ft, length_ft, listed_price_cents, prices_hidden, starting_from, on_lot_since, is_featured, manufacturer_id, manufacturers(name), public_home_photos(storage_path, sort_order)'
    )
    .neq('id', h.id)
    .or(`manufacturer_id.eq.${h.manufacturer_id ?? '00000000-0000-0000-0000-000000000000'},type.eq.${h.type}`)
    .gte('listed_price_cents', priceLo)
    .lte('listed_price_cents', priceHi)
    .limit(20);
  const similarHomes = scoreAndRankSimilar(h, (candidates ?? []) as unknown as Array<PublicHome & { manufacturer_id: string | null; type: string }>).slice(0, 4);

  const productJsonLd = homeProductSchema(
    {
      url: absoluteUrl(`/inventory/${encodeURIComponent(h.stock_no)}`),
      name: h.name,
      description: h.headline ?? h.description ?? null,
      manufacturer: h.manufacturers?.name ?? null,
      model: h.model,
      imageUrls: allPhotos.slice(0, 6).map((p) => publicPhotoUrl(p.storage_path)),
      beds: h.beds,
      baths: h.baths,
      sqft: h.sqft,
      priceCents: h.listed_price_cents,
      startingFrom: h.starting_from,
      stockNo: h.stock_no,
      status: 'in_stock',
    },
    'Upstate Home Sales',
  );

  return (
    <main className="section">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: productJsonLd }} />
      <VisitorTracker eventType="home_view" homeId={h.id} />
      <div className="inner">
        <nav className="inv-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className="sep">›</span>
          <Link href="/inventory">Inventory</Link>
          <span className="sep">›</span>
          {h.manufacturers?.name && (
            <>
              <Link href={`/inventory?mfr=${encodeURIComponent(h.manufacturers.name.toLowerCase())}`}>
                {h.manufacturers.name}
              </Link>
              <span className="sep">›</span>
            </>
          )}
          <span className="current">{h.name}</span>
        </nav>

        <Gallery photos={galleryPhotos} />

        <div className="detail-grid">
          <div>

            <div>
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

            {/* Anchor target for HomeCard's "Design home" CTA. Phase C will replace
                this placeholder with the real configurator. */}
            <div id="design" style={{ marginTop: 'var(--s-10)', padding: 'var(--s-6)', background: 'var(--c-bg)', borderRadius: 'var(--r-2)', border: '1px dashed var(--c-line)' }}>
              <div className="eyebrow">Coming soon</div>
              <h3 style={{ marginTop: 6 }}>Design this home</h3>
              <p style={{ marginTop: 8, color: 'var(--c-ink-soft)' }}>
                Pick siding colors, cabinets, flooring, and appliances — see your real-time price as you build.
                In the meantime, <Link href="/contact" style={{ color: 'var(--c-accent)' }}>tell us what you have in mind</Link>.
              </p>
            </div>
          </div>

          <aside className="detail-aside">
            <QuoteForm
              homeId={h.id}
              homeName={h.name}
              stockNo={h.stock_no}
              listedPriceCents={h.listed_price_cents}
              startingFrom={h.starting_from}
              pricesHidden={h.prices_hidden}
              beds={h.beds}
              baths={h.baths}
              sqft={h.sqft}
              widthFt={h.width_ft ?? null}
              lengthFt={h.length_ft ?? null}
              manufacturerName={h.manufacturers?.name ?? null}
              modelName={h.model}
              heroUrl={heroUrl}
            />
          </aside>
        </div>

        {similarHomes.length > 0 && (
          <section style={{ marginTop: 'var(--s-12)' }}>
            <div className="section-head">
              <div className="lhs">
                <div className="eyebrow">Similar homes</div>
                <h2>You might also like</h2>
                <p style={{ color: 'var(--c-ink-mute)', marginTop: 8 }}>
                  Picked by manufacturer, type, and price range.
                </p>
              </div>
            </div>
            <div className="inv-grid-public">
              {similarHomes.map((sh, i) => (
                <HomeCard key={sh.id} home={sh as any} index={i} />
              ))}
            </div>
          </section>
        )}

        <RecentlyViewedRecorder stock_no={h.stock_no} name={h.name} />
      </div>
    </main>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function scoreAndRankSimilar(
  current: PublicHome & { manufacturer_id?: string | null },
  candidates: Array<PublicHome & { manufacturer_id: string | null; type: string }>,
): Array<PublicHome & { manufacturer_id: string | null; type: string }> {
  const currentPrice = current.listed_price_cents ?? 0;
  function score(c: typeof candidates[number]): number {
    let s = 0;
    if (c.manufacturer_id && current.manufacturer_id && c.manufacturer_id === current.manufacturer_id) s += 5;
    if (c.type === current.type) s += 3;
    if (currentPrice && c.listed_price_cents) {
      const delta = Math.abs(c.listed_price_cents - currentPrice) / currentPrice;
      if (delta < 0.1) s += 2;
      else if (delta < 0.2) s += 1;
    }
    if (current.beds != null && c.beds != null && Math.abs(c.beds - current.beds) <= 1) s += 1;
    return s;
  }
  return [...candidates].sort((a, b) => score(b) - score(a));
}
