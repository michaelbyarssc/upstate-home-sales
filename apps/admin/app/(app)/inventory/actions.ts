'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type HomeAddon, type HomeStatus, type HomeType } from '@uhs/db';

type HomeFields = {
  stock_no: string;
  name: string;
  manufacturer_id: string | null;
  model: string | null;
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
  base_price_cents: number;
  markup_pct: number;
  addons_cents: number;
  addons_markup_pct: number;
  addons_jsonb: HomeAddon[];
  setup_cents: number;
  setup_markup_pct: number;
  include_setup_in_price: boolean;
  starting_from: boolean;
  headline: string | null;
  description: string | null;
  matterport_url: string | null;
  status: HomeStatus;
  on_lot_since: string | null;
  is_featured: boolean;
  hide_from_search: boolean;
  marketplace_opt_in: boolean;
  lot_id: string | null;
};

function parseInt0(v: FormDataEntryValue | null): number {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
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

function parseDollarsToCents(v: FormDataEntryValue | null): number {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function parseStr(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function parseChecked(fd: FormData, name: string): boolean {
  return fd.get(name) === 'on' || fd.get(name) === 'true';
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

function parseAddons(fd: FormData): { addons_jsonb: HomeAddon[]; addons_cents: number; addons_markup_pct: number } {
  const raw = fd.get('addons_jsonb');
  let items: HomeAddon[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(String(raw));
      if (Array.isArray(parsed)) {
        items = parsed
          .filter((a: any) => a.description?.trim() || a.cost_cents > 0)
          .map((a: any) => ({
            description: String(a.description ?? '').trim(),
            cost_cents: Math.round(Number(a.cost_cents) || 0),
            markup_pct: Number(a.markup_pct) || 0,
          }));
      }
    } catch {}
  }
  // Compute the fully marked-up total, store as addons_cents with 0 markup_pct
  // so the generated listed_price_cents column stays correct.
  const markedUpTotal = items.reduce((sum, a) => {
    return sum + a.cost_cents + Math.round((a.cost_cents * a.markup_pct) / 100);
  }, 0);
  return { addons_jsonb: items, addons_cents: markedUpTotal, addons_markup_pct: 0 };
}

function readFields(fd: FormData): HomeFields {
  return {
    stock_no: String(fd.get('stock_no') ?? '').trim(),
    name: String(fd.get('name') ?? '').trim(),
    manufacturer_id: parseStr(fd.get('manufacturer_id')),
    model: parseStr(fd.get('model')),
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
    base_price_cents: parseDollarsToCents(fd.get('base_price_dollars')),
    markup_pct: Number(parseFloatOrNull(fd.get('markup_pct')) ?? 0),
    ...parseAddons(fd),
    setup_cents: parseDollarsToCents(fd.get('setup_dollars')),
    setup_markup_pct: Number(parseFloatOrNull(fd.get('setup_markup_pct')) ?? 0),
    include_setup_in_price: parseChecked(fd, 'include_setup_in_price'),
    starting_from: parseChecked(fd, 'starting_from'),
    headline: parseStr(fd.get('headline')),
    description: parseStr(fd.get('description')),
    matterport_url: parseStr(fd.get('matterport_url')),
    status: (parseStr(fd.get('status')) as HomeStatus) ?? 'published',
    on_lot_since: parseStr(fd.get('on_lot_since')),
    is_featured: parseChecked(fd, 'is_featured'),
    hide_from_search: parseChecked(fd, 'hide_from_search'),
    marketplace_opt_in: parseChecked(fd, 'marketplace_opt_in'),
    lot_id: parseStr(fd.get('lot_id')),
  };
}

export async function createHome(fd: FormData) {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org');

  const fields = readFields(fd);
  if (!fields.stock_no || !fields.name) {
    throw new Error('Stock # and Listing name are required');
  }

  const { data, error } = await supabase
    .from('homes')
    .insert({ ...fields, org_id: orgId })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  revalidatePath('/inventory');
  redirect(`/inventory/${data.id}`);
}

export async function updateHome(id: string, fd: FormData) {
  const supabase = createClient();
  const fields = readFields(fd);
  if (!fields.stock_no || !fields.name) {
    throw new Error('Stock # and Listing name are required');
  }

  const { error } = await supabase.from('homes').update(fields).eq('id', id);
  if (error) throw new Error(error.message);

  revalidatePath('/inventory');
  revalidatePath(`/inventory/${id}`);
}

export async function archiveHome(id: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc('archive_home', { home_id: id });
  if (error) throw new Error(error.message);
  revalidatePath('/inventory');
}

export async function restoreHome(id: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc('restore_home', { home_id: id });
  if (error) throw new Error(error.message);
  revalidatePath('/inventory');
  revalidatePath(`/inventory/${id}`);
}

export async function deletePhoto(photoId: string, homeId: string) {
  const supabase = createClient();
  const { data: photo } = await supabase
    .from('home_photos')
    .select('storage_path')
    .eq('id', photoId)
    .maybeSingle();
  if (photo?.storage_path) {
    await supabase.storage.from('home-photos').remove([photo.storage_path]);
  }
  const { error } = await supabase.from('home_photos').delete().eq('id', photoId);
  if (error) throw new Error(error.message);
  revalidatePath(`/inventory/${homeId}`);
}

export async function reorderPhotos(homeId: string, orderedIds: string[]) {
  const supabase = createClient();
  const { data: existing, error: fetchErr } = await supabase
    .from('home_photos')
    .select('id')
    .eq('home_id', homeId);
  if (fetchErr) throw new Error(fetchErr.message);

  const validIds = new Set((existing ?? []).map((p) => p.id));
  if (orderedIds.length !== validIds.size || orderedIds.some((id) => !validIds.has(id))) {
    throw new Error('Photo set mismatch');
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('home_photos')
      .update({ sort_order: i })
      .eq('id', orderedIds[i]);
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/inventory/${homeId}`);
}
