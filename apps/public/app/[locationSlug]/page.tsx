import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createPublicClient, publicPhotoUrl } from '../../lib/supabase';
import { HomeCard } from '../../components/HomeCard';
import type { Location, PublicHome } from '@uhs/db';

export const revalidate = 300;

type FeaturedHome = PublicHome & {
  manufacturers?: { name: string } | null;
  public_home_photos?: Array<{ storage_path: string; sort_order: number }> | null;
};

/** Resolves a slug to a Location row, or null if not found / soft-deleted. */
async function getLocation(slug: string): Promise<Location | null> {
  // Reserve known top-level routes so they don't collide with slugs.
  const reserved = new Set([
    'inventory', 'financing', 'about', 'contact', 'kiosk', 'place',
    'portal', 'q', 'trade-in', 'api', 'sitemap.xml', 'robots.txt',
    '_next', 'favicon.ico', 'marketplace',
  ]);
  if (reserved.has(slug)) return null;

  const sb = createPublicClient();
  const { data } = await sb
    .from('locations')
    .select('*')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as Location | null) ?? null;
}

export async function generateMetadata({ params }: { params: { locationSlug: string } }) {
  const loc = await getLocation(params.locationSlug);
  if (!loc) return { title: 'Not found' };
  return {
    title: `${loc.name} · Upstate Home Center`,
    description: loc.address
      ? `Visit our ${loc.name} location at ${loc.address}, ${loc.city ?? ''} ${loc.state ?? ''} ${loc.zip ?? ''}.`
      : `Visit our ${loc.name} location.`,
  };
}

export default async function LocationHomePage({ params }: { params: { locationSlug: string } }) {
  const loc = await getLocation(params.locationSlug);
  if (!loc) notFound();

  // Featured inventory across the whole org (not yet filtered by location —
  // until lots are tied to specific locations and homes are tied to lots,
  // showing all org inventory under each location is the safe default).
  const sb = createPublicClient();
  const { data: featured } = await sb
    .from('public_homes')
    .select(
      'id, stock_no, name, model, type, beds, baths, beds_options, baths_options, sqft, width_ft, length_ft, listed_price_cents, prices_hidden, starting_from, on_lot_since, is_featured, manufacturer_id, manufacturers(name), public_home_photos(storage_path, sort_order)'
    )
    .order('is_featured', { ascending: false })
    .order('on_lot_since', { ascending: false, nullsFirst: false })
    .limit(6);
  const homes = (featured ?? []) as unknown as FeaturedHome[];

  const heroHome = homes.find((h) => (h.public_home_photos?.length ?? 0) > 0);
  const heroPhotoUrl = heroHome?.public_home_photos?.[0]?.storage_path
    ? publicPhotoUrl(heroHome.public_home_photos[0].storage_path)
    : null;

  // Per-location brand color override, with org fallback.
  const brand = loc.brand_color ?? 'var(--c-brand)';

  return (
    <main>
      <section className="section" style={{ paddingTop: 'var(--s-10)' }}>
        <div className="inner" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-8)', alignItems: 'center' }}>
          <div>
            <div className="eyebrow" style={{ color: brand }}>{loc.name}</div>
            <h1 style={{ fontFamily: 'var(--f-display)', fontSize: 'var(--t-display-l)', marginTop: 'var(--s-3)' }}>
              Manufactured homes,<br />
              <em style={{ color: brand }}>without the runaround.</em>
            </h1>
            <p style={{ marginTop: 'var(--s-5)', fontSize: 'var(--t-body-l)', color: 'var(--c-ink-soft)', maxWidth: 540 }}>
              {loc.address
                ? `Visit us at ${loc.address}${loc.city ? `, ${loc.city}` : ''}${loc.state ? `, ${loc.state}` : ''}${loc.zip ? ` ${loc.zip}` : ''}.`
                : 'Browse our inventory and we’ll help you find the right floor plan.'}
              {loc.phone && <> Call {loc.phone} to schedule a walk-through.</>}
            </p>
            <div style={{ marginTop: 'var(--s-6)', display: 'flex', gap: 'var(--s-3)' }}>
              <Link href="/inventory" className="btn btn-primary" style={{ background: brand, borderColor: brand }}>
                Home Options
              </Link>
              <Link href="/financing" className="btn btn-secondary">Financing options</Link>
            </div>
          </div>

          {heroPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroPhotoUrl}
              alt=""
              style={{ width: '100%', borderRadius: 'var(--r-3)', border: '1px solid var(--c-line)' }}
            />
          ) : (
            <div style={{
              width: '100%', aspectRatio: '4/3', background: 'var(--c-bg)',
              borderRadius: 'var(--r-3)', border: '1px solid var(--c-line)',
            }} />
          )}
        </div>
      </section>

      <section className="section" style={{ background: 'var(--c-bg)' }}>
        <div className="inner">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <div className="eyebrow">Featured listings</div>
              <h2 style={{ fontFamily: 'var(--f-display)', fontSize: 'var(--t-h1)', marginTop: 'var(--s-2)' }}>
                Featured Homes This Week
              </h2>
            </div>
            <Link href="/inventory" style={{ color: brand, fontWeight: 500 }}>See All Homes →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--s-5)', marginTop: 'var(--s-6)' }}>
            {homes.slice(0, 6).map((h, i) => (
              <HomeCard key={h.id} home={h} index={i} />
            ))}
          </div>
        </div>
      </section>

      {loc.hours_jsonb && (
        <section className="section">
          <div className="inner">
            <div className="eyebrow">Hours</div>
            <h2 style={{ fontFamily: 'var(--f-display)', fontSize: 'var(--t-h2)', marginTop: 'var(--s-2)' }}>
              When we&rsquo;re open
            </h2>
            <ul style={{ listStyle: 'none', margin: 'var(--s-5) 0 0', padding: 0, display: 'grid', gap: 4, maxWidth: 320 }}>
              {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((day) => {
                const h = loc.hours_jsonb?.[day];
                const label = day.charAt(0).toUpperCase() + day.slice(1);
                return (
                  <li key={day} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--c-line)', padding: '4px 0' }}>
                    <span>{label}</span>
                    <span style={{ color: 'var(--c-ink-mute)' }}>
                      {h?.closed ? 'Closed' : (h?.open && h?.close ? `${h.open} – ${h.close}` : '—')}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}
