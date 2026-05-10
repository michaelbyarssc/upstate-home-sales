'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import {
  ACTIVE_ORG_COOKIE,
  type ModelOption,
  type ModelOptionValue,
  type OptionCategory,
  type OptionOverlay,
} from '@uhs/db';

/** Add an option slot to a model (e.g., "Siding color" → slot_name "siding_main"). */
export async function createOption(args: {
  homeModelId: string;
  slotName: string;
  label: string;
  category: OptionCategory;
  required: boolean;
}): Promise<ModelOption> {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org');

  const slotName = args.slotName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60);
  if (!slotName) throw new Error('Slot name is required');
  const label = args.label.trim();
  if (!label) throw new Error('Label is required');

  // Compute next sort_order.
  const { data: existing } = await supabase
    .from('model_options')
    .select('sort_order')
    .eq('home_model_id', args.homeModelId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (existing?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('model_options')
    .insert({
      org_id: orgId,
      home_model_id: args.homeModelId,
      slot_name: slotName,
      label,
      category: args.category,
      required: args.required,
      sort_order: nextOrder,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Insert failed');
  revalidatePath(`/catalog/${args.homeModelId}/options`);
  return data as ModelOption;
}

export async function updateOption(
  id: string,
  patch: Partial<Pick<ModelOption, 'label' | 'category' | 'required' | 'sort_order'>>,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('model_options').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteOption(id: string, homeModelId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('model_options').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath(`/catalog/${homeModelId}/options`);
}

/** Add a value (pickable choice) to an option slot. */
export async function createValue(args: {
  optionId: string;
  homeModelId: string;
  valueName: string;
  label: string;
  /** Hex color, e.g. "#cbb89a". For non-color overlays, build via UI later. */
  colorHex?: string | null;
  priceDeltaCents: number;
  isDefault: boolean;
}): Promise<ModelOptionValue> {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org');

  const valueName = args.valueName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60);
  if (!valueName) throw new Error('Value name is required');
  const label = args.label.trim();
  if (!label) throw new Error('Label is required');

  // If marking as default, demote other defaults for this option.
  if (args.isDefault) {
    await supabase
      .from('model_option_values')
      .update({ is_default: false })
      .eq('option_id', args.optionId)
      .eq('is_default', true);
  }

  const { data: existing } = await supabase
    .from('model_option_values')
    .select('sort_order')
    .eq('option_id', args.optionId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (existing?.sort_order ?? -1) + 1;

  const overlay: OptionOverlay = args.colorHex
    ? { type: 'color', color: args.colorHex }
    : { type: undefined };

  const { data, error } = await supabase
    .from('model_option_values')
    .insert({
      org_id: orgId,
      option_id: args.optionId,
      value_name: valueName,
      label,
      overlay,
      price_delta_cents: Math.round(args.priceDeltaCents),
      is_default: args.isDefault,
      sort_order: nextOrder,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Insert failed');
  revalidatePath(`/catalog/${args.homeModelId}/options`);
  return data as ModelOptionValue;
}

export async function deleteValue(id: string, homeModelId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('model_option_values').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath(`/catalog/${homeModelId}/options`);
}

/** Promote a value to the option's default. */
export async function setDefaultValue(valueId: string, optionId: string, homeModelId: string): Promise<void> {
  const supabase = createClient();
  // Demote all other defaults for this option.
  await supabase
    .from('model_option_values')
    .update({ is_default: false })
    .eq('option_id', optionId);
  const { error } = await supabase
    .from('model_option_values')
    .update({ is_default: true })
    .eq('id', valueId);
  if (error) throw new Error(error.message);
  revalidatePath(`/catalog/${homeModelId}/options`);
}
