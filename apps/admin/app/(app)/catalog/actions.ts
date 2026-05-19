'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type HomeType } from '@uhs/db';

type ModelFields = {
  name: string;
  manufacturer_id: string | null;
  model_code: string | null;
  series: string | null;
  type: HomeType;
  beds: number | null;
  baths: number | null;
  beds_options: number[] | null;
  baths_options: number[] | null;
  sqft: number | null;
  width_ft: number | null;
  length_ft: number | null;
  year_built: number | null;
  construction: string | null;
  headline: string | null;
  description: string | null;
  source_url: string | null;
};

function parseStr(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function parseIntOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseFloatOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseNumberArray(v: FormDataEntryValue | null): number[] | null {
  if (v == null || v === '' || v === '[]') return null;
  try {
    const arr = JSON.parse(String(v));
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.map(Number).filter(Number.isFinite);
    }
  } catch {}
  return null;
}

function readFields(fd: FormData): ModelFields {
  return {
    name: String(fd.get('name') ?? '').trim(),
    manufacturer_id: parseStr(fd.get('manufacturer_id')),
    model_code: parseStr(fd.get('model_code')),
    series: parseStr(fd.get('series')),
    type: (parseStr(fd.get('type')) as HomeType) ?? 'double',
    beds: parseIntOrNull(fd.get('beds')),
    baths: parseFloatOrNull(fd.get('baths')),
    beds_options: parseNumberArray(fd.get('beds_options')),
    baths_options: parseNumberArray(fd.get('baths_options')),
    sqft: parseIntOrNull(fd.get('sqft')),
    width_ft: parseIntOrNull(fd.get('width_ft')),
    length_ft: parseIntOrNull(fd.get('length_ft')),
    year_built: parseIntOrNull(fd.get('year_built')),
    construction: parseStr(fd.get('construction')),
    headline: parseStr(fd.get('headline')),
    description: parseStr(fd.get('description')),
    source_url: parseStr(fd.get('source_url')),
  };
}

export async function createModel(fd: FormData) {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org');

  const fields = readFields(fd);
  if (!fields.name) throw new Error('Model name is required');

  const { data, error } = await supabase
    .from('home_models')
    .insert({ ...fields, org_id: orgId })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  revalidatePath('/catalog');
  redirect(`/catalog/${data.id}`);
}

export async function updateModel(id: string, fd: FormData) {
  const supabase = createClient();
  const fields = readFields(fd);
  if (!fields.name) throw new Error('Model name is required');

  const { error } = await supabase.from('home_models').update(fields).eq('id', id);
  if (error) throw new Error(error.message);

  revalidatePath('/catalog');
  revalidatePath(`/catalog/${id}`);
}

export async function archiveModel(id: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc('archive_model', { model_id: id });
  if (error) throw new Error(error.message);
  revalidatePath('/catalog');
}

export async function restoreModel(id: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc('restore_model', { model_id: id });
  if (error) throw new Error(error.message);
  revalidatePath('/catalog');
  revalidatePath(`/catalog/${id}`);
}

export async function deleteModelPhoto(photoId: string, modelId: string) {
  const supabase = createClient();
  const { data: photo } = await supabase
    .from('home_model_photos')
    .select('storage_path')
    .eq('id', photoId)
    .maybeSingle();
  if (photo?.storage_path) {
    await supabase.storage.from('home-photos').remove([photo.storage_path]);
  }
  const { error } = await supabase.from('home_model_photos').delete().eq('id', photoId);
  if (error) throw new Error(error.message);
  revalidatePath(`/catalog/${modelId}`);
}

/**
 * Bulk-stock catalog models onto a lot. Creates one homes row per model
 * with auto-generated stock_no, copies photos.
 *
 * Tenant isolation: enforced via RLS (the user's session client) AND an
 * explicit pre-check that every modelId + the lotId belongs to the active
 * org. Either path failing rejects the whole batch.
 */
export async function stockModelsOnLot(input: {
  modelIds: string[];
  lotId: string;
}): Promise<{ created: number; stockNos: string[] }> {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org');
  if (!input.modelIds || input.modelIds.length === 0) {
    throw new Error('Pick at least one model to stock');
  }
  if (!input.lotId) throw new Error('Pick a lot');

  // Validate lot belongs to active org and isn't soft-deleted.
  const { data: lot, error: lotErr } = await supabase
    .from('lots')
    .select('id, name, org_id, deleted_at')
    .eq('id', input.lotId)
    .maybeSingle();
  if (lotErr) throw new Error(`Lot lookup failed: ${lotErr.message}`);
  if (!lot) throw new Error('Lot not found');
  if (lot.org_id !== orgId) throw new Error('Lot belongs to another org');
  if (lot.deleted_at) throw new Error('Lot is archived');

  // Validate all models belong to active org. RLS already enforces this in
  // SELECT, but we double-check by counting matched rows.
  const { data: models, error: modelsErr } = await supabase
    .from('home_models')
    .select('id, name, model_code, manufacturer_id, type, beds, baths, beds_options, baths_options, sqft, width_ft, length_ft, year_built, construction, headline, description')
    .in('id', input.modelIds)
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (modelsErr) throw new Error(`Model lookup failed: ${modelsErr.message}`);
  if (!models || models.length !== input.modelIds.length) {
    throw new Error('One or more selected models are not in this org');
  }

  // Stock each model
  const stockNos: string[] = [];
  for (const m of models) {
    const stockNo = await nextStockNo(supabase, orgId, m.model_code ?? slugify(m.name));

    // Insert the home
    const { data: home, error: hErr } = await supabase
      .from('homes')
      .insert({
        org_id: orgId,
        lot_id: input.lotId,
        model_id: m.id,
        stock_no: stockNo,
        name: m.name,
        manufacturer_id: m.manufacturer_id,
        model: m.model_code,
        type: m.type,
        beds: m.beds,
        baths: m.baths,
        beds_options: (m as any).beds_options ?? null,
        baths_options: (m as any).baths_options ?? null,
        sqft: m.sqft,
        width_ft: m.width_ft,
        length_ft: m.length_ft,
        year_built: m.year_built,
        construction: m.construction,
        base_price_cents: 0,
        markup_pct: 0,
        addons_cents: 0,
        setup_cents: 0,
        include_setup_in_price: true,
        status: 'draft',
        on_lot_since: new Date().toISOString().slice(0, 10),
        headline: m.headline,
        description: m.description,
      })
      .select('id')
      .single();
    if (hErr || !home) {
      throw new Error(`Failed to stock ${m.name}: ${hErr?.message ?? 'no row'}`);
    }

    // Copy photos from home_model_photos → home_photos
    const { data: modelPhotos } = await supabase
      .from('home_model_photos')
      .select('storage_path, sort_order, alt_text, width, height')
      .eq('home_model_id', m.id)
      .order('sort_order');
    if (modelPhotos && modelPhotos.length > 0) {
      const rows = modelPhotos.map((p) => ({
        home_id: home.id,
        org_id: orgId,
        storage_path: p.storage_path,
        sort_order: p.sort_order,
        alt_text: p.alt_text,
        width: p.width,
        height: p.height,
      }));
      const { error: phErr } = await supabase.from('home_photos').insert(rows);
      if (phErr) {
        // Photos are non-fatal — the home is created; user can add photos manually
        console.warn(`Photo copy failed for ${m.name}: ${phErr.message}`);
      }
    }

    stockNos.push(stockNo);
  }

  revalidatePath('/catalog');
  revalidatePath('/inventory');
  return { created: models.length, stockNos };
}

function slugify(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 16);
}

async function nextStockNo(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  baseCode: string,
): Promise<string> {
  const prefix = baseCode || 'HOME';
  // Find the highest existing -NNN suffix for this prefix in the org.
  const { data } = await supabase
    .from('homes')
    .select('stock_no')
    .eq('org_id', orgId)
    .like('stock_no', `${prefix}-%`);
  const used = new Set<number>();
  for (const r of data ?? []) {
    const m = r.stock_no.match(/-(\d{3,})$/);
    if (m) used.add(parseInt(m[1], 10));
  }
  let n = 1;
  while (used.has(n)) n++;
  return `${prefix}-${String(n).padStart(3, '0')}`;
}
