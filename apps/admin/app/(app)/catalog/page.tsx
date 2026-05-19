import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { HOME_PHOTO_BUCKET, type HomeModel, type Lot, type Manufacturer } from '@uhs/db';
import { CatalogTable, type CatalogRow } from './catalog-table';
import '../inventory/inventory.css';

type SearchParams = {
  manufacturer?: string;
  type?: string;
  q?: string;
  archived?: string;
};

export const dynamic = 'force-dynamic';

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createClient();
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
    .from('home_models')
    .select('id, name, model_code, series, type, beds, baths, sqft, manufacturer_id, manufacturers(name)')
    .limit(500);

  if (showArchived) {
    query = query.not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
  } else {
    query = query.is('deleted_at', null).order('name');
  }
  if (mfrId) query = query.eq('manufacturer_id', mfrId);
  if (homeType) query = query.eq('type', homeType);
  if (q) query = query.or(`name.ilike.%${q}%,model_code.ilike.%${q}%,series.ilike.%${q}%`);

  const [{ data: models, error }, { data: manufacturers }, { data: lots }, { data: photos }] = await Promise.all([
    query,
    supabase.from('manufacturers').select('id, slug, name').order('name'),
    supabase.from('lots').select('id, name').is('deleted_at', null).order('name'),
    // First photo per model — fetch all then group client-side (small dataset)
    supabase.from('home_model_photos').select('home_model_id, storage_path, sort_order').order('sort_order'),
  ]);

  if (error) {
    return (
      <>
        <div className="page-header"><h1>Catalog</h1></div>
        <div className="banner-warn">Failed to load catalog: {error.message}</div>
      </>
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publicPhotoBaseUrl = `${url}/storage/v1/object/public/${HOME_PHOTO_BUCKET}`;

  const photoCount = new Map<string, number>();
  const heroPhoto = new Map<string, string>();
  for (const p of (photos ?? []) as Array<{ home_model_id: string; storage_path: string; sort_order: number }>) {
    photoCount.set(p.home_model_id, (photoCount.get(p.home_model_id) ?? 0) + 1);
    if (!heroPhoto.has(p.home_model_id)) {
      heroPhoto.set(p.home_model_id, `${publicPhotoBaseUrl}/${p.storage_path}`);
    }
  }

  type ModelRow = Pick<HomeModel, 'id' | 'name' | 'model_code' | 'series' | 'type' | 'beds' | 'baths' | 'sqft' | 'manufacturer_id'> & {
    manufacturers: { name: string } | null;
  };
  const rows: CatalogRow[] = ((models ?? []) as unknown as ModelRow[]).map((m) => ({
    id: m.id,
    name: m.name,
    model_code: m.model_code,
    series: m.series,
    type: m.type,
    beds: m.beds,
    baths: m.baths,
    sqft: m.sqft,
    manufacturer_name: m.manufacturers?.name ?? null,
    photo_count: photoCount.get(m.id) ?? 0,
    hero_url: heroPhoto.get(m.id) ?? null,
  }));

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div className="eyebrow">Workspace · Catalog</div>
          <h1>Home models</h1>
          <p>{showArchived ? `Showing ${rows.length} archived models` : `${rows.length} reusable templates · check one or more, then stock to a lot.`}</p>
        </div>
        <Link href="/catalog/new" style={{
          background: 'var(--adm-accent)', color: '#fff', padding: '9px 14px',
          borderRadius: 6, textDecoration: 'none', fontWeight: 500, fontSize: 13,
        }}>
          + Add model
        </Link>
      </div>

      <form className="inv-filters" method="GET" action="/catalog">
        <span>Filter</span>
        <select name="manufacturer" defaultValue={mfrSlug ?? ''}>
          <option value="">All manufacturers</option>
          {((manufacturers ?? []) as Pick<Manufacturer, 'id' | 'slug' | 'name'>[]).map((m) => (
            <option key={m.id} value={m.slug}>{m.name}</option>
          ))}
        </select>
        <select name="type" defaultValue={homeType ?? ''}>
          <option value="">All types</option>
          <option value="single">Single-wide</option>
          <option value="double">Double-wide</option>
          <option value="modular">Modular</option>
        </select>
        <input type="text" name="q" placeholder="Search name, model code, series" defaultValue={q ?? ''} className="grow" />
        <button type="submit" className="btn">Apply</button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" name="archived" value="true" defaultChecked={showArchived} />
          Show archived
        </label>
        <span className="results"><strong>{rows.length}</strong> match</span>
      </form>

      <CatalogTable rows={rows} lots={(lots ?? []) as Pick<Lot, 'id' | 'name'>[]} showArchived={showArchived} />
    </>
  );
}
