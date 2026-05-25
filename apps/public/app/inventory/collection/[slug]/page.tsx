import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createPublicClient, publicPhotoUrl } from '../../../../lib/supabase';
import { HomeCard } from '../../../../components/HomeCard';
import { absoluteUrl, itemListSchema } from '../../../../lib/seo';
import type { PublicHome } from '@uhs/db';

type Params = { slug: string };
export const revalidate = 120;

export async function generateMetadata({ params }: { params: Params }) {
  const sb = createPublicClient();
  const { data } = await sb
    .from('public_collections')
    .select('name, description')
    .eq('slug', params.slug)
    .maybeSingle();
  if (!data) return { title: 'Collection' };
  return { title: data.name, description: data.description ?? undefined };
}

export default async function CollectionPage({ params }: { params: Params }) {
  const sb = createPublicClient();
  const { data: collection } = await sb
    .from('public_collections')
    .select('id, name, description, hero_storage_path')
    .eq('slug', params.slug)
    .maybeSingle();
  if (!collection) notFound();

  // Pull member home_ids for this collection, then fetch the homes from public_homes.
  const { data: members } = await sb
    .from('public_collection_members')
    .select('home_id, sort_order')
    .eq('collection_id', collection.id)
    .order('sort_order');
  const homeIds = (members ?? []).map((m: { home_id: string }) => m.home_id);

  let homes: Array<PublicHome & { manufacturers?: { name: string } | null; public_home_photos?: Array<{ storage_path: string; sort_order: number }> | null }> = [];
  if (homeIds.length > 0) {
    const { data } = await sb
      .from('public_homes')
      .select(
        'id, stock_no, name, model, type, beds, baths, sqft, width_ft, length_ft, listed_price_cents, prices_hidden, starting_from, on_lot_since, is_featured, manufacturer_id, manufacturers(name), public_home_photos(storage_path, sort_order)'
      )
      .in('id', homeIds);
    // Preserve the curator's order from the members table.
    const byId = new Map((data ?? []).map((h: any) => [h.id, h]));
    homes = homeIds.map((id) => byId.get(id)).filter(Boolean) as typeof homes;
  }

  const heroUrl = collection.hero_storage_path
    ? publicPhotoUrl(collection.hero_storage_path)
    : (homes[0]?.public_home_photos?.[0]
        ? publicPhotoUrl(homes[0].public_home_photos[0].storage_path)
        : null);

  const itemListJsonLd = itemListSchema(
    homes.map((h) => ({
      url: absoluteUrl(`/inventory/${encodeURIComponent(h.stock_no)}`),
      name: h.name,
    })),
  );

  return (
    <main className="section">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: itemListJsonLd }} />
      <div className="inner">
        <nav className="inv-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className="sep">›</span>
          <Link href="/inventory">Available Homes</Link>
          <span className="sep">›</span>
          <span className="current">{collection.name}</span>
        </nav>

        <div
          className="collection-hero"
          style={heroUrl ? { backgroundImage: `linear-gradient(180deg, rgba(15,28,41,0.0) 0%, rgba(15,28,41,0.55) 100%), url(${heroUrl})` } : undefined}
        >
          <div className="collection-hero-text">
            <div className="eyebrow" style={{ color: heroUrl ? 'rgba(255,255,255,0.85)' : 'var(--c-ink-mute)' }}>
              Collection
            </div>
            <h1 style={{ color: heroUrl ? '#fff' : 'var(--c-ink)' }}>{collection.name}</h1>
            {collection.description && (
              <p style={{ color: heroUrl ? 'rgba(255,255,255,0.92)' : 'var(--c-ink-soft)' }}>
                {collection.description}
              </p>
            )}
            <p style={{ marginTop: 12, fontSize: 14, color: heroUrl ? 'rgba(255,255,255,0.8)' : 'var(--c-ink-mute)' }}>
              {homes.length} home{homes.length === 1 ? '' : 's'} in this collection
            </p>
          </div>
        </div>

        {homes.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid var(--c-line)', borderRadius: 'var(--r-2)', padding: 60, textAlign: 'center', marginTop: 24 }}>
            <h3>No homes here yet</h3>
            <p style={{ color: 'var(--c-ink-mute)', marginTop: 8 }}>
              Check back soon, or <Link href="/inventory">browse the full inventory →</Link>
            </p>
          </div>
        ) : (
          <div className="inv-grid-public" style={{ marginTop: 24 }}>
            {homes.map((h, i) => (
              <HomeCard key={h.id} home={h} index={i} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
