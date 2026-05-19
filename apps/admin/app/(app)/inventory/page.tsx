import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { formatCents, formatBedsOrBaths, type Home, type Manufacturer, type HomeStatus } from '@uhs/db';
import './inventory.css';

type SearchParams = {
  status?: string;
  manufacturer?: string;
  type?: string;
  q?: string;
  archived?: string;
};

const STATUSES: Array<{ key: HomeStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Draft' },
  { key: 'hold', label: 'Hold' },
  { key: 'sold', label: 'Sold' },
  { key: 'archived', label: 'Archived' },
];

function statusBadge(status: HomeStatus) {
  const map: Record<HomeStatus, string> = {
    published: 'bd-success',
    draft: 'bd-soft',
    hold: 'bd-warn',
    sold: 'bd-info',
    archived: 'bd-soft',
  };
  return <span className={`bd ${map[status]}`}>{status}</span>;
}

function lotAge(date: string | null) {
  if (!date) return <span className="bd bd-soft">—</span>;
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
  if (days <= 14) return <span className="bd bd-info">New · {days}d</span>;
  if (days > 90) return <span className="bd bd-warn">{days} days</span>;
  return <span className="bd bd-soft">{days} days</span>;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createClient();
  const status = (searchParams.status as HomeStatus | undefined) ?? undefined;
  const mfrSlug = searchParams.manufacturer;
  const homeType = searchParams.type;
  const q = searchParams.q?.trim();
  const showArchived = searchParams.archived === 'true';

  let mfrId: string | null = null;
  if (mfrSlug) {
    const { data } = await supabase
      .from('manufacturers')
      .select('id')
      .eq('slug', mfrSlug)
      .maybeSingle();
    mfrId = data?.id ?? null;
  }

  let query = supabase
    .from('homes')
    .select(
      'id, stock_no, name, model, type, beds, baths, beds_options, baths_options, sqft, base_price_cents, markup_pct, listed_price_cents, status, on_lot_since, deleted_at, manufacturer_id, manufacturers(name)'
    )
    .limit(200);

  if (showArchived) {
    query = query.not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
  } else {
    query = query.is('deleted_at', null).order('on_lot_since', { ascending: false, nullsFirst: false });
  }

  if (!showArchived && status) query = query.eq('status', status);
  if (mfrId) query = query.eq('manufacturer_id', mfrId);
  if (homeType) query = query.eq('type', homeType);
  if (q) query = query.or(`name.ilike.%${q}%,stock_no.ilike.%${q}%,model.ilike.%${q}%`);

  const [{ data: rows, error }, { data: manufacturers }, { data: counts }] = await Promise.all([
    query,
    supabase.from('manufacturers').select('id, slug, name').order('name'),
    supabase.from('homes').select('status').is('deleted_at', null),
  ]);

  if (error) {
    return (
      <>
        <div className="page-header">
          <h1>Inventory</h1>
        </div>
        <div className="banner-warn">Failed to load inventory: {error.message}</div>
      </>
    );
  }

  const tally: Record<string, number> = {};
  (counts ?? []).forEach((r: { status: HomeStatus }) => {
    tally[r.status] = (tally[r.status] ?? 0) + 1;
  });
  const total = Object.values(tally).reduce((a, b) => a + b, 0);

  type RowShape = Pick<
    Home,
    | 'id'
    | 'stock_no'
    | 'name'
    | 'model'
    | 'type'
    | 'beds'
    | 'baths'
    | 'beds_options'
    | 'baths_options'
    | 'sqft'
    | 'base_price_cents'
    | 'markup_pct'
    | 'listed_price_cents'
    | 'status'
    | 'on_lot_since'
    | 'manufacturer_id'
  > & { manufacturers: { name: string } | null };
  const homes = (rows ?? []) as unknown as RowShape[];

  const tabHref = (key: string) => {
    const sp = new URLSearchParams();
    if (key !== 'all') sp.set('status', key);
    if (mfrSlug) sp.set('manufacturer', mfrSlug);
    if (homeType) sp.set('type', homeType);
    if (q) sp.set('q', q);
    const s = sp.toString();
    return s ? `/inventory?${s}` : '/inventory';
  };

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div className="eyebrow">Workspace · Week 2</div>
          <h1>Inventory</h1>
          <p>{showArchived ? `Showing ${homes.length} archived homes` : `${total} non-archived listings · base + markup never exposed publicly.`}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/inventory/new" style={{
            background: 'var(--adm-accent)', color: '#fff', padding: '9px 14px',
            borderRadius: 6, textDecoration: 'none', fontWeight: 500, fontSize: 13,
          }}>
            + Add home
          </Link>
        </div>
      </div>

      {!showArchived && (
        <nav className="inv-tabs">
          {STATUSES.map((t) => {
            const active = (status ?? 'all') === t.key;
            const count = t.key === 'all' ? total : tally[t.key] ?? 0;
            return (
              <Link key={t.key} href={tabHref(t.key)} className={active ? 'active' : ''}>
                {t.label} <span className="count">· {count}</span>
              </Link>
            );
          })}
        </nav>
      )}

      <form className="inv-filters" method="GET" action="/inventory">
        {status && <input type="hidden" name="status" value={status} />}
        <span>Filter</span>
        <select name="manufacturer" defaultValue={mfrSlug ?? ''}>
          <option value="">All manufacturers</option>
          {((manufacturers ?? []) as Pick<Manufacturer, 'id' | 'slug' | 'name'>[]).map((m) => (
            <option key={m.id} value={m.slug}>
              {m.name}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={homeType ?? ''}>
          <option value="">All types</option>
          <option value="single">Single-wide</option>
          <option value="double">Double-wide</option>
          <option value="modular">Modular</option>
        </select>
        <input type="text" name="q" placeholder="Search name, stock #, model" defaultValue={q ?? ''} className="grow" />
        <button type="submit" className="btn">Apply</button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" name="archived" value="true" defaultChecked={showArchived} />
          Show archived
        </label>
        <span className="results">
          <strong>{homes.length}</strong> match
        </span>
      </form>

      {homes.length === 0 ? (
        <div className="empty-state">
          <h3>No homes match</h3>
          <p>Try clearing filters or add your first listing.</p>
          <Link href="/inventory/new" style={{
            background: 'var(--adm-accent)', color: '#fff', padding: '10px 16px',
            borderRadius: 6, textDecoration: 'none', fontWeight: 500, fontSize: 13,
            display: 'inline-block',
          }}>+ Add a home</Link>
        </div>
      ) : (
        <table className="inv-table">
          <thead>
            <tr>
              <th>Home</th>
              <th>Stock #</th>
              <th>Beds/Baths</th>
              <th className="num">Sq ft</th>
              <th className="num">Base price</th>
              <th className="num">Markup</th>
              <th className="num">Listed price</th>
              <th>Status</th>
              <th>Lot age</th>
            </tr>
          </thead>
          <tbody>
            {homes.map((h) => (
              <tr key={h.id}>
                <td>
                  <div className="row-name">
                    <div className="row-thumb" />
                    <div>
                      <Link href={`/inventory/${h.id}`}>{h.name}</Link>
                      <div className="sub">
                        {h.manufacturers?.name ?? '—'}
                        {h.model ? ` · ${h.model}` : ''}
                      </div>
                    </div>
                  </div>
                </td>
                <td><span className="stock">{h.stock_no}</span></td>
                <td>{formatBedsOrBaths(h.beds, h.beds_options)}/{formatBedsOrBaths(h.baths, h.baths_options)}</td>
                <td className="num">{h.sqft?.toLocaleString() ?? '—'}</td>
                <td className="num">{formatCents(h.base_price_cents)}</td>
                <td className="num" style={{ color: 'var(--adm-ink-mute)' }}>
                  +{Number(h.markup_pct).toFixed(0)}%
                </td>
                <td className="num"><strong>{formatCents(h.listed_price_cents)}</strong></td>
                <td>{statusBadge(h.status)}</td>
                <td>{lotAge(h.on_lot_since)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
