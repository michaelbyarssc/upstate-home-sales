import Link from 'next/link';
import { createPublicClient } from '../../lib/supabase';
import { HomeCard } from '../../components/HomeCard';
import type { PublicHome } from '@uhs/db';

export const metadata = { title: 'Inventory' };
export const revalidate = 120;

type SearchParams = { type?: string; mfr?: string; q?: string; price?: string };

export default async function InventoryListPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createPublicClient();
  const { type, mfr, q, price } = searchParams;

  let mfrId: string | null = null;
  if (mfr) {
    const { data } = await supabase.from('manufacturers').select('id').eq('slug', mfr).maybeSingle();
    mfrId = data?.id ?? null;
  }

  let query = supabase
    .from('public_homes')
    .select(
      'id, stock_no, name, model, type, beds, baths, sqft, listed_price_cents, starting_from, on_lot_since, is_featured, manufacturer_id, manufacturers(name), public_home_photos(storage_path, sort_order)'
    )
    .order('is_featured', { ascending: false })
    .order('on_lot_since', { ascending: false, nullsFirst: false })
    .limit(48);
  if (type) query = query.eq('type', type);
  if (mfrId) query = query.eq('manufacturer_id', mfrId);
  if (q) query = query.or(`name.ilike.%${q}%,model.ilike.%${q}%`);
  if (price === 'u100') query = query.lt('listed_price_cents', 10_000_000);
  else if (price === '100-200') query = query.gte('listed_price_cents', 10_000_000).lt('listed_price_cents', 20_000_000);
  else if (price === 'o200') query = query.gte('listed_price_cents', 20_000_000);

  const [{ data: rows }, { data: manufacturers }] = await Promise.all([
    query,
    supabase.from('manufacturers').select('id, slug, name').order('name'),
  ]);
  const homes = (rows ?? []) as unknown as PublicHome[];

  return (
    <main className="section">
      <div className="inner">
        <div className="section-head">
          <div className="lhs">
            <div className="eyebrow">Inventory</div>
            <h2>Homes ready to walk through</h2>
            <p style={{ color: 'var(--c-ink-mute)', marginTop: 8 }}>
              {homes.length} listings · prices update live · come see it on the lot.
            </p>
          </div>
        </div>

        <form className="filter-bar" method="GET" action="/inventory">
          <select name="type" defaultValue={type ?? ''}>
            <option value="">All types</option>
            <option value="single">Single-wide</option>
            <option value="double">Double-wide</option>
            <option value="modular">Modular</option>
          </select>
          <select name="mfr" defaultValue={mfr ?? ''}>
            <option value="">All manufacturers</option>
            {(manufacturers ?? []).map((m: { id: string; slug: string; name: string }) => (
              <option key={m.id} value={m.slug}>{m.name}</option>
            ))}
          </select>
          <select name="price" defaultValue={price ?? ''}>
            <option value="">Any price</option>
            <option value="u100">Under $100k</option>
            <option value="100-200">$100k – $200k</option>
            <option value="o200">$200k+</option>
          </select>
          <input type="text" name="q" placeholder="Search by name or model" defaultValue={q ?? ''} />
          <button type="submit" className="btn btn-primary btn-sm">Filter</button>
          {(type || mfr || q || price) && (
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
          <div className="inv-grid-public">
            {homes.map((h, i) => (
              <HomeCard key={h.id} home={h} index={i} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
