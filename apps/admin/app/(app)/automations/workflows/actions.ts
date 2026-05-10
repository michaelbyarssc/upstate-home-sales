'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type WorkflowAction, type WorkflowEvent } from '@uhs/db';

export async function createWorkflowRule(formData: FormData) {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org');

  const name = String(formData.get('name') ?? '').trim();
  const event = String(formData.get('event') ?? '').trim() as WorkflowEvent;
  const filterRaw = String(formData.get('filter') ?? '').trim();
  let filter: Record<string, unknown> | null = null;
  if (filterRaw) {
    try {
      filter = JSON.parse(filterRaw);
    } catch {
      throw new Error('Filter must be valid JSON, e.g. {"stage":"quoted"}');
    }
  }
  if (!name) throw new Error('Name is required');
  if (!event) throw new Error('Event is required');

  const { data, error } = await supabase
    .from('workflow_rules')
    .insert({
      org_id: orgId,
      name,
      enabled: false,
      event,
      filter,
      actions: [],
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Insert failed');

  revalidatePath('/automations/workflows');
  redirect(`/automations/workflows/${data.id}`);
}

export async function updateWorkflowRule(
  id: string,
  patch: Partial<{ name: string; enabled: boolean; event: WorkflowEvent; filter: Record<string, unknown> | null; actions: WorkflowAction[] }>,
) {
  const supabase = createClient();
  const { error } = await supabase.from('workflow_rules').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/automations/workflows');
  revalidatePath(`/automations/workflows/${id}`);
}

export async function setRuleEnabled(id: string, enabled: boolean) {
  return updateWorkflowRule(id, { enabled });
}

export async function setRuleActions(id: string, actions: WorkflowAction[]) {
  return updateWorkflowRule(id, { actions });
}

export async function deleteWorkflowRule(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from('workflow_rules').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/automations/workflows');
}
