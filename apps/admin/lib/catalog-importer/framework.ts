// Framework — Supabase client is injected so this works for both the
// service-role CLI and the in-app session-bound admin path.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogAdapter, ModelData, ModelRef, ProgressEvent } from './types';

const BUCKET = 'home-photos';
const DEFAULT_UA = 'UHS-Catalog-Importer/1.0 (+michael@upstatehomesales.com)';

// ── HTTP ─────────────────────────────────────────────────────────────────────

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': DEFAULT_UA } });
  if (!res.ok) throw new Error(`fetchText ${url}: HTTP ${res.status}`);
  return res.text();
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { 'User-Agent': DEFAULT_UA } });
  if (!res.ok) throw new Error(`fetchBytes ${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Resolvers ────────────────────────────────────────────────────────────────

export async function resolveOrgId(
  sb: SupabaseClient,
  orgSlug: string | null,
): Promise<{ id: string; name: string }> {
  if (orgSlug) {
    const { data } = await sb.from('orgs').select('id, name').eq('slug', orgSlug).maybeSingle();
    if (!data) throw new Error(`resolveOrgId: no org with slug "${orgSlug}"`);
    return { id: data.id as string, name: data.name as string };
  }
  const { data } = await sb
    .from('orgs')
    .select('id, name, slug')
    .eq('status', 'active')
    .order('created_at')
    .limit(2);
  if (!data || data.length === 0) throw new Error('resolveOrgId: no active orgs');
  if (data.length > 1) {
    throw new Error(`resolveOrgId: multiple active orgs — disambiguate (${data.map((o: any) => o.slug).join(', ')})`);
  }
  return { id: data[0]!.id as string, name: data[0]!.name as string };
}

export async function resolveManufacturerId(
  sb: SupabaseClient,
  slug: string,
): Promise<{ id: string; name: string }> {
  const { data } = await sb.from('manufacturers').select('id, name').eq('slug', slug).maybeSingle();
  if (!data) throw new Error(`resolveManufacturerId: no manufacturer with slug "${slug}"`);
  return { id: data.id as string, name: data.name as string };
}

// ── Catalog writes ───────────────────────────────────────────────────────────

const MODEL_FIELDS = [
  'name',
  'model_code',
  'series',
  'type',
  'beds',
  'baths',
  'sqft',
  'width_ft',
  'length_ft',
  'year_built',
  'construction',
  'headline',
  'description',
  'source_url',
] as const;

const FIELD_MAP: Record<(typeof MODEL_FIELDS)[number], keyof ModelData> = {
  name: 'name',
  model_code: 'modelCode',
  series: 'series',
  type: 'type',
  beds: 'beds',
  baths: 'baths',
  sqft: 'sqft',
  width_ft: 'widthFt',
  length_ft: 'lengthFt',
  year_built: 'yearBuilt',
  construction: 'construction',
  headline: 'headline',
  description: 'description',
  source_url: 'sourceUrl',
};

function pickModelRow(orgId: string, manufacturerId: string, data: ModelData) {
  const row: Record<string, unknown> = { org_id: orgId, manufacturer_id: manufacturerId };
  for (const col of MODEL_FIELDS) {
    const v = data[FIELD_MAP[col]];
    if (v != null) row[col] = v;
  }
  return row;
}

export async function upsertHomeModel(
  sb: SupabaseClient,
  orgId: string,
  manufacturerId: string,
  data: ModelData,
  opts: { update: boolean },
): Promise<{ id: string; action: 'created' | 'updated' | 'skipped' }> {
  const { data: existing } = await sb
    .from('home_models')
    .select('id')
    .eq('org_id', orgId)
    .eq('name', data.name)
    .is('deleted_at', null)
    .maybeSingle();

  const row = pickModelRow(orgId, manufacturerId, data);

  if (existing) {
    if (!opts.update) return { id: existing.id as string, action: 'skipped' };
    const { error } = await sb.from('home_models').update(row).eq('id', existing.id);
    if (error) throw new Error(`update home_models ${data.name}: ${error.message}`);
    return { id: existing.id as string, action: 'updated' };
  }

  const { data: inserted, error } = await sb
    .from('home_models')
    .insert(row)
    .select('id')
    .single();
  if (error || !inserted) throw new Error(`insert home_models ${data.name}: ${error?.message ?? 'no row'}`);
  return { id: inserted.id as string, action: 'created' };
}

// ── Photo sync ───────────────────────────────────────────────────────────────

function extensionFromUrl(url: string): string {
  const noQs = url.split('?')[0]!;
  const m = noQs.match(/\.(\w{2,5})$/);
  return (m ? m[1]! : 'jpg').toLowerCase();
}

function contentTypeFor(ext: string): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function quickId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function syncModelPhotos(
  sb: SupabaseClient,
  orgId: string,
  modelId: string,
  photos: ModelData['photos'],
  opts: { replaceAll: boolean; throttleMs?: number },
): Promise<{ uploaded: number; total: number; skipped: boolean }> {
  const throttleMs = opts.throttleMs ?? 150;
  if (opts.replaceAll) {
    const { data: existing } = await sb
      .from('home_model_photos')
      .select('storage_path')
      .eq('home_model_id', modelId);
    const paths = (existing ?? []).map((r: any) => r.storage_path as string);
    if (paths.length > 0) {
      await sb.storage.from(BUCKET).remove(paths);
      await sb.from('home_model_photos').delete().eq('home_model_id', modelId);
    }
  } else {
    const { count } = await sb
      .from('home_model_photos')
      .select('id', { count: 'exact', head: true })
      .eq('home_model_id', modelId);
    if ((count ?? 0) > 0) return { uploaded: 0, total: 0, skipped: true };
  }

  let uploaded = 0;
  for (const p of photos) {
    try {
      const bytes = await fetchBytes(p.url);
      const ext = extensionFromUrl(p.url);
      const seq = String(p.sortOrder).padStart(3, '0');
      const path = `${orgId}/${modelId}/${seq}-${p.kind}-${quickId()}.${ext}`;
      const { error: upErr } = await sb.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: contentTypeFor(ext), upsert: false });
      if (upErr) continue;
      const { error: rowErr } = await sb.from('home_model_photos').insert({
        home_model_id: modelId,
        org_id: orgId,
        storage_path: path,
        sort_order: p.sortOrder,
        alt_text: p.alt ?? null,
      });
      if (rowErr) continue;
      uploaded++;
    } catch {
      // Per-photo failures don't fail the whole model; report via the
      // returned counts.
    }
    if (throttleMs > 0) await sleep(throttleMs);
  }
  return { uploaded, total: photos.length, skipped: false };
}

// ── Run orchestration ────────────────────────────────────────────────────────

export type DiscoveryResult = {
  adapter: { slug: string; displayName: string; manufacturerSlug: string };
  models: ModelData[];
};

/**
 * Fast preview pass — fetches the listing and every detail page (so we know
 * photo counts), but does NOT touch the DB or storage. Suitable for the
 * "Discover" step in the admin UI.
 */
export async function runDiscovery(args: {
  adapter: CatalogAdapter;
  url: string;
}): Promise<DiscoveryResult> {
  const refs = await args.adapter.listModels({ url: args.url });
  const models: ModelData[] = [];
  for (const ref of refs) {
    if (args.adapter.crawlDelayMs) await sleep(args.adapter.crawlDelayMs);
    try {
      models.push(await args.adapter.fetchModel(ref));
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      models.push({
        name: ref.name,
        type: 'double',
        sourceUrl: ref.detailUrl,
        description: `(discovery failed: ${err})`,
        photos: [],
      });
    }
  }
  return {
    adapter: {
      slug: args.adapter.slug,
      displayName: args.adapter.displayName,
      manufacturerSlug: args.adapter.manufacturerSlug,
    },
    models,
  };
}

export type ImportArgs = {
  sb: SupabaseClient;
  adapter: CatalogAdapter;
  url: string;
  org: { id: string; name: string };
  manufacturer: { id: string; name: string };
  update: boolean;
  only?: string[];
  onProgress?: (e: ProgressEvent) => void;
};

export async function runImport(args: ImportArgs): Promise<{
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}> {
  const refs = await args.adapter.listModels({ url: args.url });
  const filtered = args.only?.length
    ? refs.filter((r: ModelRef) => args.only!.some((n) => n.toUpperCase() === r.name.toUpperCase()))
    : refs;

  args.onProgress?.({ type: 'start', total: filtered.length });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const ref of filtered) {
    if (args.adapter.crawlDelayMs) await sleep(args.adapter.crawlDelayMs);
    try {
      const data = await args.adapter.fetchModel(ref);
      const { id: modelId, action } = await upsertHomeModel(
        args.sb,
        args.org.id,
        args.manufacturer.id,
        data,
        { update: args.update },
      );
      if (action === 'skipped') {
        skipped++;
        args.onProgress?.({ type: 'model', name: data.name, action, photos: 0, totalPhotos: data.photos.length });
        continue;
      }
      const photoResult = await syncModelPhotos(args.sb, args.org.id, modelId, data.photos, {
        replaceAll: action === 'updated',
      });
      if (action === 'created') created++;
      else updated++;
      args.onProgress?.({
        type: 'model',
        name: data.name,
        action,
        photos: photoResult.uploaded,
        totalPhotos: data.photos.length,
      });
    } catch (e) {
      errors++;
      const err = e instanceof Error ? e.message : String(e);
      args.onProgress?.({ type: 'model', name: ref.name, action: 'error', photos: 0, totalPhotos: 0, error: err });
    }
  }

  args.onProgress?.({ type: 'summary', created, updated, skipped, errors });
  return { created, updated, skipped, errors };
}
