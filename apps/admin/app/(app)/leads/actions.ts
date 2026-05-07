'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@uhs/db/server';

/**
 * Inbox-level actions. Detail-page actions live in [id]/actions.ts.
 */

export async function claimLead(leadId: string) {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('leads')
    .update({ assignee_id: uid })
    .eq('id', leadId)
    .select('id, assignee_id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Claim failed');

  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  return data;
}
