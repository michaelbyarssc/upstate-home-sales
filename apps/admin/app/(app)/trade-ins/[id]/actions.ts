'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@uhs/db/server';
import { createServiceClient } from '@uhs/db/service';
import type { TradeIn } from '@uhs/db';
import { sendEmail } from '../../../../lib/notify';

/**
 * Guarantee the trade-in has a linked lead so the offer email can route replies
 * through `leads.reply_token`. Without this, the offer email's Reply-To used the
 * trade-in's UUID as the token, which the inbound webhook can neither parse
 * (dashes break its `[a-f0-9]+` token regex) nor match (it only looks up leads),
 * so every customer reply was silently dropped.
 *
 * Lazy: only called when an offer actually goes out, so trade-ins under review
 * don't flood the leads pipeline. Idempotent — re-offering reuses the same lead.
 * Runs with the service role because `leads` has no authenticated INSERT policy
 * (all lead inserts go through service-role paths by design).
 */
async function ensureLeadForTradeIn(tradeIn: {
  id: string;
  org_id: string;
  lead_id: string | null;
  contact_name: string;
  email: string | null;
  phone: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
}): Promise<{ id: string; reply_token: string } | null> {
  const svc = createServiceClient();

  // Already linked and the lead still exists → reuse it.
  if (tradeIn.lead_id) {
    const { data: existing } = await svc
      .from('leads')
      .select('id, reply_token')
      .eq('id', tradeIn.lead_id)
      .maybeSingle();
    if (existing) return existing;
  }

  // Round-robin assignee, same rotation the public lead intake uses.
  const { data: pick } = await svc.rpc('pick_next_assignee', { p_org_id: tradeIn.org_id });
  const assigneeId = (pick as string | null) ?? null;

  const homeDesc =
    [tradeIn.year, tradeIn.make, tradeIn.model].filter(Boolean).join(' ') || 'their trade-in';

  const { data: lead, error } = await svc
    .from('leads')
    .insert({
      org_id: tradeIn.org_id,
      contact_name: tradeIn.contact_name,
      email: tradeIn.email,
      phone: tradeIn.phone,
      source: 'tradein',
      stage: 'new',
      assignee_id: assigneeId,
    })
    .select('id, reply_token')
    .single();
  if (error || !lead) {
    console.error('[trade-in] lead creation failed:', error?.message);
    return null;
  }

  // Link the trade-in back to its lead so future offers reuse this thread.
  await svc.from('trade_ins').update({ lead_id: lead.id }).eq('id', tradeIn.id);

  // Seed the timeline with the submission so the rep has context and the
  // customer's eventual reply threads under it.
  await svc.from('lead_messages').insert({
    lead_id: lead.id,
    org_id: tradeIn.org_id,
    kind: 'inbound',
    channel: 'email',
    body: `Trade-in submission: ${homeDesc}.`,
  });

  return lead;
}

export async function updateTradeIn(
  id: string,
  fields: { status?: TradeIn['status']; offer_cents?: number | null },
) {
  const supabase = createClient();

  // Read current row so we can detect transitions and pull contact info.
  const { data: existing, error: readErr } = await supabase
    .from('trade_ins')
    .select('id, status, offer_cents, contact_name, email, phone, org_id, year, make, model, lead_id')
    .eq('id', id)
    .maybeSingle();
  if (readErr || !existing) throw new Error(readErr?.message ?? 'Trade-in not found');

  const update: Record<string, unknown> = {};
  if (fields.status) update.status = fields.status;
  if ('offer_cents' in fields) update.offer_cents = fields.offer_cents;
  if (fields.status === 'reviewed' || fields.status === 'offered') {
    update.reviewed_at = new Date().toISOString();
  }

  const { error } = await supabase.from('trade_ins').update(update).eq('id', id);
  if (error) throw new Error(error.message);

  // Email the customer when transitioning to 'offered' with a cents amount.
  const becomingOffered = fields.status === 'offered' && existing.status !== 'offered';
  const finalCents = 'offer_cents' in fields ? fields.offer_cents : existing.offer_cents;
  if (becomingOffered && finalCents && existing.email) {
    const homeDesc = [existing.year, existing.make, existing.model].filter(Boolean).join(' ') || 'your trade-in';
    const dollars = (finalCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

    // Link (or reuse) a lead so the customer's reply routes back to a thread
    // instead of being dropped by the inbound webhook.
    const lead = await ensureLeadForTradeIn(existing);

    await sendEmail({
      to: existing.email,
      subject: `Your trade-in offer from Upstate Home Center`,
      // Reply-To carries the lead's thread token; the inbound webhook matches it
      // to leads.reply_token and records the reply on this lead's timeline.
      // Falls back to the trade-in id only if lead creation failed (degrades to
      // the old drop-the-reply behavior rather than blocking the offer).
      replyToToken: lead?.reply_token ?? id,
      text: [
        `Hi ${existing.contact_name},`,
        '',
        `Thanks for submitting ${homeDesc} for trade-in. Based on the photos and condition you provided, we'd like to extend the following offer:`,
        '',
        `    ${dollars}`,
        '',
        'This is a preliminary offer pending an in-person inspection. Reply to this email or call us to schedule a pickup walkthrough.',
        '',
        '— Upstate Home Center',
      ].join('\n'),
    }).catch((e) => console.error('[trade-in] offer email failed:', e));

    // Mirror the offer onto the lead timeline (and record the outbound email so
    // the customer's reply threads right under it).
    if (lead) {
      await supabase.from('lead_messages').insert([
        {
          lead_id: lead.id,
          org_id: existing.org_id,
          kind: 'outbound',
          channel: 'email',
          body: `Trade-in offer of ${dollars} sent to customer.`,
        },
      ]);
    }
  }

  revalidatePath('/trade-ins');
  revalidatePath(`/trade-ins/${id}`);
}
