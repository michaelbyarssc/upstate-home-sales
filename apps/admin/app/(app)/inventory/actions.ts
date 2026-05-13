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
    status: (parseStr(fd.get('status')) as HomeStatus) ?? 'draft',
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
  const { error } = await supabase
    .from('homes')
    .update({ status: 'archived', deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/inventory');
  redirect('/inventory');
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
