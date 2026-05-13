'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@uhs/db/server';
import { createServiceClient } from '@uhs/db/service';
import type { Lead, LeadSource } from '@uhs/db';
import { dispatchWorkflowEvent } from '../../../lib/workflows';

/**
 * Inbox-level actions. Detail-page actions live in [id]/actions.ts.
 */

export async function createLead(args: {
  orgId: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  homeId: string | null;
  smsConsent: boolean;
  note: string | null;
}): Promise<Lead> {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not authenticated');

  // Service client for insert — no authenticated INSERT policy on leads.
  const sb = createServiceClient();

  const consent = args.smsConsent;
  const consentText = consent
    ? 'I agree to receive text messages about my inquiry. Reply STOP to opt out.'
    : null;

  const { data: lead, error } = await sb
    .from('leads')
    .insert({
      org_id: args.orgId,
      home_id: args.homeId,
      contact_name: args.contactName.trim(),
      email: args.email?.trim() || null,
      phone: args.phone?.trim() || null,
      source: args.source,
      stage: 'new',
      assignee_id: uid,
      sms_consent: consent,
      sms_consent_at: consent ? new Date().toISOString() : null,
      sms_consent_text: consentText,
    })
    .select('*')
    .single();
  if (error || !lead) throw new Error(error?.message ?? 'Insert failed');

  if (args.note?.trim()) {
    await sb.from('lead_messages').insert({
      lead_id: lead.id,
      org_id: args.orgId,
      kind: 'note',
      channel: null,
      author_id: uid,
      body: args.note.trim(),
    });
  }

  await dispatchWorkflowEvent({
    event: 'lead.created',
    orgId: args.orgId,
    payload: {
      id: lead.id,
      contact_name: lead.contact_name,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      home_id: lead.home_id,
    },
  }).catch((e) => console.error('[create-lead] workflow dispatch failed:', e));

  revalidatePath('/leads');
  return lead as Lead;
}

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
