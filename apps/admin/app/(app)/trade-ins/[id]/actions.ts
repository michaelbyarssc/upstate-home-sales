'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@uhs/db/server';
import type { TradeIn } from '@uhs/db';
import { sendEmail } from '../../../../lib/notify';

export async function updateTradeIn(
  id: string,
  fields: { status?: TradeIn['status']; offer_cents?: number | null },
) {
  const supabase = createClient();

  // Read current row so we can detect transitions and pull contact info.
  const { data: existing, error: readErr } = await supabase
    .from('trade_ins')
    .select('id, status, offer_cents, contact_name, email, year, make, model, lead_id')
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
    await sendEmail({
      to: existing.email,
      subject: `Your trade-in offer from Upstate Home Center`,
      replyToToken: id, // not a lead-thread token; inbound replies go to a generic mailbox
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

    // Mirror as a system message on the linked lead, if any.
    if (existing.lead_id) {
      const { data: leadRow } = await supabase
        .from('leads')
        .select('org_id')
        .eq('id', existing.lead_id)
        .maybeSingle();
      if (leadRow?.org_id) {
        await supabase.from('lead_messages').insert({
          lead_id: existing.lead_id,
          org_id: leadRow.org_id,
          kind: 'system',
          channel: null,
          body: `Trade-in offer of ${dollars} emailed to customer.`,
        });
      }
    }
  }

  revalidatePath('/trade-ins');
  revalidatePath(`/trade-ins/${id}`);
}
