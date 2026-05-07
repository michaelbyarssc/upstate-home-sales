'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@uhs/db/server';
import type { LeadMessage, LeadStage, MessageChannel, MessageKind } from '@uhs/db';
import { sendEmail, sendSms } from '../../../../lib/notify';

export async function postMessage(
  leadId: string,
  orgId: string,
  kind: MessageKind,
  channel: MessageChannel | null,
  bodyText: string,
): Promise<LeadMessage> {
  const supabase = createClient();
  const trimmed = bodyText.trim();

  const { data, error } = await supabase
    .from('lead_messages')
    .insert({ lead_id: leadId, org_id: orgId, kind, channel, body: trimmed })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Insert failed');

  // Outbound dispatch — SendGrid for email, Twilio for SMS. Helpers no-op when
  // credentials aren't configured (local dev), so the timeline still records.
  if (kind === 'outbound') {
    const { data: lead } = await supabase
      .from('leads')
      .select('contact_name, email, phone, reply_token, sms_consent, homes(name, stock_no)')
      .eq('id', leadId)
      .maybeSingle();

    if (channel === 'email' && lead?.email) {
      const homeRel = (lead as unknown as { homes: { name: string; stock_no: string } | { name: string; stock_no: string }[] | null }).homes;
      const home = Array.isArray(homeRel) ? homeRel[0] : homeRel;
      const subject = home
        ? `RE: ${home.name} (${home.stock_no})`
        : 'RE: Your inquiry with Upstate Home Sales';
      const result = await sendEmail({
        to: lead.email,
        subject,
        text: trimmed,
        replyToToken: lead.reply_token,
      });
      if (!result.ok) {
        // Surface as a system note on the timeline so the user knows.
        await supabase.from('lead_messages').insert({
          lead_id: leadId,
          org_id: orgId,
          kind: 'system',
          channel: null,
          body: `Email delivery failed: ${result.error}`,
        });
      }
    }

    if (channel === 'sms' && lead?.phone) {
      if (!lead.sms_consent) {
        throw new Error('Cannot send SMS — customer has not opted in.');
      }
      const result = await sendSms({ to: lead.phone, body: trimmed });
      if (!result.ok) {
        await supabase.from('lead_messages').insert({
          lead_id: leadId,
          org_id: orgId,
          kind: 'system',
          channel: null,
          body: `SMS delivery failed: ${result.error}`,
        });
      }
    }
  }

  revalidatePath(`/leads/${leadId}`);
  return data as LeadMessage;
}

export async function updateLeadStage(leadId: string, stage: LeadStage) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('leads')
    .update({ stage })
    .eq('id', leadId)
    .select('id, stage')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Update failed');
  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  return data;
}

export async function updateLeadAssignee(leadId: string, userId: string | null) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('leads')
    .update({ assignee_id: userId })
    .eq('id', leadId)
    .select('id, assignee_id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Update failed');
  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  return data;
}

export async function createQuote(args: {
  leadId: string;
  orgId: string;
  homeId: string;
  validDays?: number;
}): Promise<{ public_token: string; expires_at: string; listed_price_cents: number }> {
  const supabase = createClient();

  // Snapshot listed_price_cents from the home AT THIS MOMENT.
  const { data: home, error: hErr } = await supabase
    .from('homes')
    .select('listed_price_cents')
    .eq('id', args.homeId)
    .maybeSingle();
  if (hErr || !home) throw new Error(hErr?.message ?? 'Home not found');

  const expires = new Date(Date.now() + (args.validDays ?? 14) * 86_400_000).toISOString();

  const { data: quote, error } = await supabase
    .from('quotes')
    .insert({
      org_id: args.orgId,
      lead_id: args.leadId,
      home_id: args.homeId,
      listed_price_cents: home.listed_price_cents,
      expires_at: expires,
    })
    .select('public_token, expires_at, listed_price_cents')
    .single();
  if (error || !quote) throw new Error(error?.message ?? 'Quote insert failed');

  // Advance lead stage to 'quoted'.
  await supabase.from('leads').update({ stage: 'quoted' }).eq('id', args.leadId);

  // Drop a system message into the timeline with the public link.
  const publicBase = process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomesales.com';
  const url = `${publicBase}/q/${quote.public_token}`;
  await supabase.from('lead_messages').insert({
    lead_id: args.leadId,
    org_id: args.orgId,
    kind: 'system',
    channel: null,
    body: `Quote created · ${url} · expires ${new Date(quote.expires_at).toLocaleDateString()}`,
  });

  revalidatePath(`/leads/${args.leadId}`);
  return quote;
}

export async function toggleLeadHot(leadId: string, isHot: boolean) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('leads')
    .update({ is_hot: isHot })
    .eq('id', leadId)
    .select('id, is_hot')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Update failed');
  revalidatePath(`/leads/${leadId}`);
  return data;
}
