/**
 * Workflow event dispatcher.
 *
 * Server actions and API routes call `dispatchWorkflowEvent` after a notable
 * change. This:
 *   1. Looks up enabled `workflow_rules` for the org + event
 *   2. Filters by `rule.filter` against the event payload
 *   3. Inserts a `workflow_runs` row (status=pending) for traceability
 *   4. Executes the rule's actions inline using the service-role client
 *
 * Inline execution keeps the model simple. If actions get slow we move to
 * pg_notify + a worker, but for the current set (assign, enroll, tag,
 * stage-set, notify-email) inline is fine.
 */

import { createServiceClient } from '@uhs/db/service';
import type { WorkflowAction, WorkflowEvent, WorkflowRule } from '@uhs/db';
import { sendEmail } from './notify';

type DispatchArgs = {
  event: WorkflowEvent;
  orgId: string;
  /** Lead row (for lead.* events) or quote row (for quote.*). Used for filter
   * matching and as input to action handlers. */
  payload: Record<string, unknown>;
};

export async function dispatchWorkflowEvent(args: DispatchArgs): Promise<void> {
  let sb;
  try {
    sb = createServiceClient();
  } catch {
    // No service role configured — silently skip in local dev.
    return;
  }

  const { data: rules } = await sb
    .from('workflow_rules')
    .select('id, org_id, event, filter, actions, enabled')
    .eq('org_id', args.orgId)
    .eq('event', args.event)
    .eq('enabled', true);

  if (!rules || rules.length === 0) return;

  for (const rule of rules as WorkflowRule[]) {
    if (!matchesFilter(rule.filter, args.payload)) continue;

    const { data: run } = await sb
      .from('workflow_runs')
      .insert({
        rule_id: rule.id,
        org_id: rule.org_id,
        event: rule.event,
        payload: args.payload,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    const result: Record<string, unknown> = {};
    let errText: string | null = null;
    try {
      for (const a of rule.actions ?? []) {
        const r = await runAction(a, rule.org_id, args.payload);
        result[a.type] = r;
      }
    } catch (e) {
      errText = e instanceof Error ? e.message : 'unknown';
    }

    if (run?.id) {
      await sb
        .from('workflow_runs')
        .update({
          status: errText ? 'error' : 'success',
          result,
          error_text: errText,
          finished_at: new Date().toISOString(),
        })
        .eq('id', run.id);
    }
  }
}

/** Shallow filter: every key in `filter` must equal the same key in `payload`. */
function matchesFilter(filter: Record<string, unknown> | null, payload: Record<string, unknown>): boolean {
  if (!filter) return true;
  for (const [k, v] of Object.entries(filter)) {
    if (payload[k] !== v) return false;
  }
  return true;
}

async function runAction(
  action: WorkflowAction,
  orgId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const sb = createServiceClient();

  switch (action.type) {
    case 'enroll_in_campaign': {
      const leadId = String(payload.id ?? payload.lead_id ?? '');
      if (!leadId) return { skipped: 'no lead id' };
      const { data: campaign } = await sb
        .from('campaigns')
        .select('id, status, channel')
        .eq('id', action.campaign_id)
        .eq('org_id', orgId)
        .maybeSingle();
      if (!campaign || campaign.status !== 'active') return { skipped: 'campaign inactive' };

      // First step delay = its own delay_seconds.
      const { data: firstStep } = await sb
        .from('campaign_steps')
        .select('delay_seconds')
        .eq('campaign_id', campaign.id)
        .order('step_order')
        .limit(1)
        .maybeSingle();
      const delay = firstStep?.delay_seconds ?? 0;
      const next = new Date(Date.now() + Number(delay) * 1000).toISOString();

      const { error } = await sb
        .from('campaign_enrollments')
        .upsert(
          {
            campaign_id: campaign.id,
            org_id: orgId,
            lead_id: leadId,
            status: 'active',
            current_step: 0,
            next_send_at: next,
          },
          { onConflict: 'campaign_id,lead_id' },
        );
      return error ? { error: error.message } : { enrolled: true, next_send_at: next };
    }

    case 'assign_lead': {
      const leadId = String(payload.id ?? payload.lead_id ?? '');
      if (!leadId) return { skipped: 'no lead id' };
      let userId: string | null = null;
      if (action.user_id === 'round_robin') {
        const { data: pick } = await sb.rpc('pick_next_assignee', { p_org_id: orgId });
        userId = (pick as string | null) ?? null;
      } else {
        userId = action.user_id;
      }
      const { error } = await sb.from('leads').update({ assignee_id: userId }).eq('id', leadId);
      return error ? { error: error.message } : { assignee_id: userId };
    }

    case 'set_stage': {
      const leadId = String(payload.id ?? payload.lead_id ?? '');
      if (!leadId) return { skipped: 'no lead id' };
      const { error } = await sb.from('leads').update({ stage: action.stage }).eq('id', leadId);
      return error ? { error: error.message } : { stage: action.stage };
    }

    case 'tag': {
      const leadId = String(payload.id ?? payload.lead_id ?? '');
      if (!leadId) return { skipped: 'no lead id' };
      const { data: existing } = await sb
        .from('leads')
        .select('qualifier_payload')
        .eq('id', leadId)
        .maybeSingle();
      const current = (existing?.qualifier_payload ?? {}) as Record<string, unknown>;
      const tags = Array.isArray(current.tags) ? (current.tags as string[]) : [];
      if (!tags.includes(action.value)) tags.push(action.value);
      const { error } = await sb
        .from('leads')
        .update({ qualifier_payload: { ...current, tags } })
        .eq('id', leadId);
      return error ? { error: error.message } : { tag: action.value };
    }

    case 'notify_email': {
      const r = await sendEmail({
        to: action.to,
        subject: renderTemplate(action.subject, payload),
        text: renderTemplate(action.body, payload),
        replyToToken: 'workflow',
      });
      return { sent: r.ok, error: r.error ?? null };
    }
  }
}

/** Replace {{key}} in `tpl` with `payload[key]`. Unknown keys → empty string. */
export function renderTemplate(tpl: string, payload: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
    const parts = key.split('.');
    let val: unknown = payload;
    for (const p of parts) {
      if (val && typeof val === 'object' && p in (val as Record<string, unknown>)) {
        val = (val as Record<string, unknown>)[p];
      } else {
        return '';
      }
    }
    return val == null ? '' : String(val);
  });
}
