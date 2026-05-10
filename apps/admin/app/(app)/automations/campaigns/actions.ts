'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type CampaignChannel, type CampaignStatus } from '@uhs/db';

export async function createCampaign(formData: FormData) {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org');

  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const channel = (String(formData.get('channel') ?? 'email') as CampaignChannel);
  const triggerEvent = String(formData.get('trigger_event') ?? '').trim() || null;
  const filterRaw = String(formData.get('trigger_filter') ?? '').trim();
  let triggerFilter: Record<string, unknown> | null = null;
  if (filterRaw) {
    try {
      triggerFilter = JSON.parse(filterRaw);
    } catch {
      throw new Error('Trigger filter must be valid JSON, e.g. {"source": "quote_form"}');
    }
  }

  if (!name) throw new Error('Name is required');

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      org_id: orgId,
      name,
      description,
      channel,
      status: 'draft',
      trigger_event: triggerEvent,
      trigger_filter: triggerFilter,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Insert failed');

  revalidatePath('/automations/campaigns');
  redirect(`/automations/campaigns/${data.id}`);
}

export async function updateCampaign(
  id: string,
  patch: Partial<{ name: string; description: string | null; channel: CampaignChannel; status: CampaignStatus; trigger_event: string | null; trigger_filter: Record<string, unknown> | null }>,
) {
  const supabase = createClient();
  const { error } = await supabase.from('campaigns').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/automations/campaigns');
  revalidatePath(`/automations/campaigns/${id}`);
}

export async function setCampaignStatus(id: string, status: CampaignStatus) {
  return updateCampaign(id, { status });
}

export async function addCampaignStep(campaignId: string, args: { delay_seconds: number; subject: string | null; body: string }) {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org');

  // Next step_order = max(existing) + 1.
  const { data: existing } = await supabase
    .from('campaign_steps')
    .select('step_order')
    .eq('campaign_id', campaignId)
    .order('step_order', { ascending: false })
    .limit(1);
  const nextOrder = (existing?.[0]?.step_order ?? 0) + 1;

  const { error } = await supabase.from('campaign_steps').insert({
    campaign_id: campaignId,
    org_id: orgId,
    step_order: nextOrder,
    delay_seconds: args.delay_seconds,
    subject: args.subject,
    body: args.body,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/automations/campaigns/${campaignId}`);
}

export async function updateCampaignStep(
  id: string,
  campaignId: string,
  patch: Partial<{ delay_seconds: number; subject: string | null; body: string }>,
) {
  const supabase = createClient();
  const { error } = await supabase.from('campaign_steps').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath(`/automations/campaigns/${campaignId}`);
}

export async function deleteCampaignStep(id: string, campaignId: string) {
  const supabase = createClient();
  const { error } = await supabase.from('campaign_steps').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath(`/automations/campaigns/${campaignId}`);
}

export async function moveCampaignStep(id: string, campaignId: string, direction: 'up' | 'down') {
  const supabase = createClient();
  // Fetch all steps for this campaign.
  const { data: steps } = await supabase
    .from('campaign_steps')
    .select('id, step_order')
    .eq('campaign_id', campaignId)
    .order('step_order');
  if (!steps || steps.length < 2) return;

  const idx = steps.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= steps.length) return;

  const a = steps[idx]!;
  const b = steps[swapIdx]!;
  // Two-phase swap to avoid unique-constraint collision on (campaign_id, step_order).
  // Step 1: move a to a temporary order > all current orders.
  const tempOrder = (steps[steps.length - 1]!.step_order ?? 0) + 1000;
  await supabase.from('campaign_steps').update({ step_order: tempOrder }).eq('id', a.id);
  await supabase.from('campaign_steps').update({ step_order: a.step_order }).eq('id', b.id);
  await supabase.from('campaign_steps').update({ step_order: b.step_order }).eq('id', a.id);

  revalidatePath(`/automations/campaigns/${campaignId}`);
}

export async function enrollLeadInCampaign(campaignId: string, leadId: string) {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org');

  const { data: firstStep } = await supabase
    .from('campaign_steps')
    .select('delay_seconds')
    .eq('campaign_id', campaignId)
    .order('step_order')
    .limit(1)
    .maybeSingle();
  const delaySec = Number(firstStep?.delay_seconds ?? 0);
  const next = new Date(Date.now() + delaySec * 1000).toISOString();

  const { error } = await supabase
    .from('campaign_enrollments')
    .upsert(
      {
        campaign_id: campaignId,
        org_id: orgId,
        lead_id: leadId,
        status: 'active',
        current_step: 0,
        next_send_at: next,
      },
      { onConflict: 'campaign_id,lead_id' },
    );
  if (error) throw new Error(error.message);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/automations/campaigns/${campaignId}`);
}
