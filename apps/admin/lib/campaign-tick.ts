/**
 * Campaign tick: process due drip enrollments.
 *
 * Called by Vercel Cron (or any timer) via /api/cron/campaign-tick. Finds
 * enrollments whose `next_send_at` has passed, sends the next step, advances
 * `current_step`, and either schedules the next step or marks the enrollment
 * `completed`.
 *
 * Uses the service role so it can bypass RLS while joining campaign + lead.
 */

import { createServiceClient } from '@uhs/db/service';
import type { Campaign, CampaignStep, Lead } from '@uhs/db';
import { sendEmail, sendSms } from './notify';
import { renderTemplate } from './workflows';

type TickResult = {
  processed: number;
  sent: number;
  completed: number;
  errored: number;
  skipped: number;
  errors: Array<{ enrollment_id: string; error: string }>;
};

const BATCH_SIZE = 100;

export async function runCampaignTick(): Promise<TickResult> {
  const out: TickResult = { processed: 0, sent: 0, completed: 0, errored: 0, skipped: 0, errors: [] };

  let sb;
  try {
    sb = createServiceClient();
  } catch {
    return out;
  }

  const now = new Date().toISOString();
  const { data: due } = await sb
    .from('campaign_enrollments')
    .select('id, campaign_id, org_id, lead_id, status, current_step, next_send_at')
    .eq('status', 'active')
    .lte('next_send_at', now)
    .order('next_send_at')
    .limit(BATCH_SIZE);

  if (!due || due.length === 0) return out;

  for (const e of due) {
    out.processed++;
    try {
      // Look up the next step (step_order = current_step + 1).
      const nextOrder = e.current_step + 1;
      const { data: step } = await sb
        .from('campaign_steps')
        .select('id, step_order, delay_seconds, subject, body')
        .eq('campaign_id', e.campaign_id)
        .eq('step_order', nextOrder)
        .maybeSingle();

      if (!step) {
        // No more steps — mark completed.
        await sb
          .from('campaign_enrollments')
          .update({ status: 'completed', next_send_at: null, completed_at: new Date().toISOString() })
          .eq('id', e.id);
        out.completed++;
        continue;
      }

      const { data: campaign } = await sb
        .from('campaigns')
        .select('id, channel, name')
        .eq('id', e.campaign_id)
        .maybeSingle();
      if (!campaign) {
        out.skipped++;
        continue;
      }

      const { data: lead } = await sb
        .from('leads')
        .select('contact_name, email, phone, reply_token, sms_consent, org_id')
        .eq('id', e.lead_id)
        .maybeSingle();
      if (!lead) {
        out.skipped++;
        await sb.from('campaign_enrollments').update({ status: 'errored', error_text: 'lead missing' }).eq('id', e.id);
        continue;
      }

      const { data: org } = await sb.from('orgs').select('name').eq('id', e.org_id).maybeSingle();

      const tplCtx: Record<string, unknown> = {
        contact_name: lead.contact_name,
        first_name: lead.contact_name?.split(' ')[0] ?? '',
        org_name: org?.name ?? '',
      };

      const subject = step.subject ? renderTemplate(step.subject, tplCtx) : `Update from ${tplCtx.org_name}`;
      const body = renderTemplate(step.body, tplCtx);

      // Dispatch.
      let sendResult: { ok: boolean; error?: string; skipped?: boolean };
      if ((campaign as Campaign).channel === 'email') {
        if (!lead.email) {
          sendResult = { ok: false, error: 'lead has no email' };
        } else {
          sendResult = await sendEmail({
            to: lead.email,
            subject,
            text: body,
            replyToToken: lead.reply_token,
          });
        }
      } else {
        if (!lead.phone) {
          sendResult = { ok: false, error: 'lead has no phone' };
        } else if (!lead.sms_consent) {
          sendResult = { ok: false, error: 'lead has not consented to SMS' };
        } else {
          sendResult = await sendSms({ to: lead.phone, body });
        }
      }

      if (!sendResult.ok && !sendResult.skipped) {
        out.errored++;
        out.errors.push({ enrollment_id: e.id, error: sendResult.error ?? 'send failed' });
        // Mark the enrollment errored but allow manual retry by toggling status.
        await sb
          .from('campaign_enrollments')
          .update({ status: 'errored', error_text: sendResult.error ?? 'send failed' })
          .eq('id', e.id);
        continue;
      }

      out.sent++;

      // Log a system message on the lead timeline so the rep sees the touch.
      await sb.from('lead_messages').insert({
        lead_id: e.lead_id,
        org_id: e.org_id,
        kind: 'system',
        channel: (campaign as Campaign).channel,
        body: `Campaign "${(campaign as { name: string }).name}" step ${step.step_order} sent.`,
      });

      // Schedule the step after this one (if any).
      const { data: after } = await sb
        .from('campaign_steps')
        .select('delay_seconds')
        .eq('campaign_id', e.campaign_id)
        .eq('step_order', step.step_order + 1)
        .maybeSingle();

      if (after) {
        const next = new Date(Date.now() + Number(after.delay_seconds) * 1000).toISOString();
        await sb
          .from('campaign_enrollments')
          .update({ current_step: step.step_order, next_send_at: next })
          .eq('id', e.id);
      } else {
        await sb
          .from('campaign_enrollments')
          .update({
            current_step: step.step_order,
            next_send_at: null,
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', e.id);
        out.completed++;
      }
    } catch (err) {
      out.errored++;
      out.errors.push({ enrollment_id: e.id, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  return out;
}
