'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type HomeRegionPricing, type RegionKind } from '@uhs/db';

function normalizeRegion(kind: RegionKind, value: string): string {
  const trimmed = value.trim();
  if (kind === 'zip') {
    const digits = trimmed.replace(/[^0-9]/g, '').slice(0, 5);
    if (digits.length !== 5) throw new Error('Zip must be 5 digits');
    return digits;
  }
  if (kind === 'state') {
    if (!/^[A-Za-z]{2}$/.test(trimmed)) throw new Error('State must be 2 letters');
    return trimmed.toUpperCase();
  }
  // county
  if (!trimmed) throw new Error('County name required');
  return trimmed;
}

export async function addRegionPrice(args: {
  homeId: string;
  regionType: RegionKind;
  regionValue: string;
  overridePriceDollars: number;
  effectiveAt?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
}): Promise<HomeRegionPricing> {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org');

  const value = normalizeRegion(args.regionType, args.regionValue);
  const cents = Math.round(args.overridePriceDollars * 100);
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error('Override price must be positive');
  }

  const { data, error } = await supabase
    .from('home_region_pricing')
    .insert({
      home_id: args.homeId,
      org_id: orgId,
      region_type: args.regionType,
      region_value: value,
      override_price_cents: cents,
      effective_at: args.effectiveAt || null,
      expires_at: args.expiresAt || null,
      notes: args.notes?.trim() || null,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Insert failed');
  revalidatePath(`/inventory/${args.homeId}`);
  revalidatePath(`/inventory/${args.homeId}/regional-pricing`);
  return data as HomeRegionPricing;
}

export async function deleteRegionPrice(id: string, homeId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('home_region_pricing').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath(`/inventory/${homeId}`);
  revalidatePath(`/inventory/${homeId}/regional-pricing`);
}
