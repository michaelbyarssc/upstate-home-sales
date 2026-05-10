'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@uhs/db/server';
import type { DeliveryZone, Lot, Org, OrgSetbackRules, ZoneKind } from '@uhs/db';

export async function saveOrg(patch: {
  id: string;
  name: string;
  brand_color: string | null;
  default_markup_pct: number;
  sms_consent_text: string;
  prices_hidden: boolean;
}) {
  const supabase = createClient();
  const { error } = await supabase
    .from('orgs')
    .update({
      name: patch.name,
      brand_color: patch.brand_color,
      default_markup_pct: patch.default_markup_pct,
      sms_consent_text: patch.sms_consent_text,
      prices_hidden: patch.prices_hidden,
    })
    .eq('id', patch.id);
  if (error) throw new Error(error.message);
  revalidatePath('/settings');
}

// ─── Setback rules (Phase E) ──────────────────────────────────────────────

export async function saveSetbackRules(patch: {
  orgId: string;
  front_ft: number;
  side_ft: number;
  rear_ft: number;
  road_easement_ft: number;
}): Promise<OrgSetbackRules> {
  const supabase = createClient();
  // Upsert: every org gets a row from the migration backfill, but defend
  // against the case where a brand-new org doesn't yet have one.
  const { data, error } = await supabase
    .from('org_setback_rules')
    .upsert(
      {
        org_id: patch.orgId,
        front_ft: Math.max(0, Math.min(200, Math.round(patch.front_ft))),
        side_ft: Math.max(0, Math.min(200, Math.round(patch.side_ft))),
        rear_ft: Math.max(0, Math.min(200, Math.round(patch.rear_ft))),
        road_easement_ft: Math.max(0, Math.min(200, Math.round(patch.road_easement_ft))),
      },
      { onConflict: 'org_id' },
    )
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Save failed');
  revalidatePath('/settings');
  return data as OrgSetbackRules;
}

export async function addLot(args: { orgId: string; name: string; address: string | null }): Promise<Lot> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('lots')
    .insert({ org_id: args.orgId, name: args.name, address: args.address })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Insert failed');
  revalidatePath('/settings');
  return data as Lot;
}

export async function updateLot(id: string, patch: Partial<Pick<Lot, 'name' | 'address'>>) {
  const supabase = createClient();
  const { error } = await supabase.from('lots').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/settings');
}

export async function archiveLot(id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from('lots')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/settings');
}

// ─── Delivery zones ───────────────────────────────────────────────────────

export async function addDeliveryZone(args: {
  orgId: string;
  kind: ZoneKind;
  value: string;
  label: string | null;
}): Promise<DeliveryZone> {
  const supabase = createClient();
  const cleaned = args.kind === 'zip'
    ? args.value.replace(/[^0-9]/g, '').slice(0, 5)
    : args.value.trim();
  if (!cleaned) throw new Error('Value is required');
  if (args.kind === 'zip' && cleaned.length !== 5) throw new Error('Zip must be 5 digits');

  const { data, error } = await supabase
    .from('delivery_zones')
    .insert({ org_id: args.orgId, kind: args.kind, value: cleaned, label: args.label })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Insert failed');
  revalidatePath('/settings');
  return data as DeliveryZone;
}

export async function deleteDeliveryZone(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from('delivery_zones').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/settings');
}
