'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@uhs/db/server';
import type { Lot, Org } from '@uhs/db';

export async function saveOrg(patch: {
  id: string;
  name: string;
  brand_color: string | null;
  default_markup_pct: number;
  sms_consent_text: string;
}) {
  const supabase = createClient();
  const { error } = await supabase
    .from('orgs')
    .update({
      name: patch.name,
      brand_color: patch.brand_color,
      default_markup_pct: patch.default_markup_pct,
      sms_consent_text: patch.sms_consent_text,
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
