'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@uhs/db/server';
import type { DeliveryZone, Lot, Org, ZoneKind } from '@uhs/db';

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
