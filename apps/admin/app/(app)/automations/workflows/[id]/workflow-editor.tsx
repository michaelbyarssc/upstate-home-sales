'use client';

import { useState, useTransition } from 'react';
import type { Campaign, LeadStage, WorkflowAction, WorkflowEvent, WorkflowRule } from '@uhs/db';
import { setRuleActions, setRuleEnabled, updateWorkflowRule, deleteWorkflowRule } from '../actions';

const EVENTS: Array<{ value: WorkflowEvent; label: string }> = [
  { value: 'lead.created', label: 'Lead created' },
  { value: 'lead.stage.changed', label: 'Lead stage changed' },
  { value: 'quote.sent', label: 'Quote sent' },
  { value: 'quote.signed', label: 'Quote signed' },
  { value: 'lead.message.received', label: 'Inbound reply received' },
];

const ACTION_TYPES: WorkflowAction['type'][] = [
  'enroll_in_campaign',
  'assign_lead',
  'set_stage',
  'tag',
  'notify_email',
];

const LEAD_STAGES: LeadStage[] = ['new', 'in_progress', 'quoted', 'won', 'lost'];

type Props = {
  rule: WorkflowRule;
  campaigns: Pick<Campaign, 'id' | 'name' | 'status'>[];
  members: Array<{ user_id: string; role: string }>;
};

export function WorkflowEditor({ rule, campaigns, members }: Props) {
  const [draft, setDraft] = useState(rule);
  const [actions, setActions] = useState<WorkflowAction[]>(Array.isArray(rule.actions) ? rule.actions : []);
  const [filterText, setFilterText] = useState(rule.filter ? JSON.stringify(rule.filter, null, 2) : '');
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function saveMeta() {
    setErr(null);
    let filter: Record<string, unknown> | null = null;
    if (filterText.trim()) {
      try {
        filter = JSON.parse(filterText);
      } catch {
        setErr('Filter must be valid JSON.');
        return;
      }
    }
    startTransition(async () => {
      try {
        await updateWorkflowRule(rule.id, {
          name: draft.name,
          event: draft.event,
          filter,
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Save failed');
      }
    });
  }

  function toggleEnabled() {
    const next = !draft.enabled;
    setDraft((r) => ({ ...r, enabled: next }));
    startTransition(async () => {
      try {
        await setRuleEnabled(rule.id, next);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Toggle failed');
        setDraft((r) => ({ ...r, enabled: !next }));
      }
    });
  }

  function persistActions(next: WorkflowAction[]) {
    setActions(next);
    startTransition(async () => {
      try {
        await setRuleActions(rule.id, next);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Save failed');
      }
    });
  }

  function addAction(type: WorkflowAction['type']) {
    let blank: WorkflowAction;
    switch (type) {
      case 'enroll_in_campaign':
        blank = { type, campaign_id: campaigns[0]?.id ?? '' };
        break;
      case 'assign_lead':
        blank = { type, user_id: 'round_robin' };
        break;
      case 'set_stage':
        blank = { type, stage: 'in_progress' };
        break;
      case 'tag':
        blank = { type, value: 'vip' };
        break;
      case 'notify_email':
        blank = { type, to: '', subject: '', body: '' };
        break;
    }
    persistActions([...actions, blank]);
  }

  function patchAction(idx: number, patch: Partial<WorkflowAction>) {
    persistActions(actions.map((a, i) => (i === idx ? { ...a, ...patch } as WorkflowAction : a)));
  }

  function moveAction(idx: number, direction: 'up' | 'down') {
    const swap = direction === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= actions.length) return;
    const copy = [...actions];
    [copy[idx], copy[swap]] = [copy[swap], copy[idx]];
    persistActions(copy);
  }

  function removeAction(idx: number) {
    if (!confirm('Delete this action?')) return;
    persistActions(actions.filter((_, i) => i !== idx));
  }

  async function deleteRule() {
    if (!confirm(`Delete rule "${rule.name}"? This cannot be undone.`)) return;
    try {
      await deleteWorkflowRule(rule.id);
      window.location.href = '/automations/workflows';
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {err && <div style={{ background: '#fee', color: '#a00', padding: 10, borderRadius: 6, fontSize: 13 }}>{err}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((r) => ({ ...r, name: e.target.value }))}
            onBlur={saveMeta}
            style={{
              font: '700 22px/1.2 var(--f-display, var(--f-body))',
              border: 'none', background: 'transparent', padding: 0, color: 'var(--adm-ink)',
              width: 'min(420px, 100%)',
            }}
          />
          <span className={`pill ${draft.enabled ? 'enabled' : 'disabled'}`}>
            {draft.enabled ? 'enabled' : 'disabled'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={toggleEnabled}
            className="status-btn primary"
            style={{
              background: draft.enabled ? '#fff' : 'var(--adm-accent)',
              color: draft.enabled ? 'var(--adm-ink)' : '#fff',
              border: '1px solid ' + (draft.enabled ? 'var(--adm-line)' : 'var(--adm-accent)'),
              padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            {draft.enabled ? 'Disable' : 'Enable'}
          </button>
          <button
            onClick={deleteRule}
            style={{
              background: '#fff', color: '#b3261e', border: '1px solid var(--adm-line)',
              padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="auto-form" style={{ maxWidth: 'none' }}>
        <div className="auto-section-head">When this event fires</div>

        <div className="row">
          <div className="field">
            <label htmlFor="wf-event">Event</label>
            <select
              id="wf-event"
              value={draft.event}
              onChange={(e) => {
                setDraft((r) => ({ ...r, event: e.target.value as WorkflowEvent }));
              }}
              onBlur={saveMeta}
            >
              {EVENTS.map((ev) => <option key={ev.value} value={ev.value}>{ev.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button
              onClick={saveMeta}
              type="button"
              style={{
                background: '#fff', border: '1px solid var(--adm-line)', color: 'var(--adm-ink)',
                padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              }}
            >
              Save event &amp; filter
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="wf-filter">Filter (JSON, optional)</label>
          <textarea
            id="wf-filter"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            onBlur={saveMeta}
            placeholder={'{ "stage": "quoted" }'}
            rows={3}
          />
        </div>
      </div>

      <div className="auto-form" style={{ maxWidth: 'none' }}>
        <div className="auto-section-head">Then run these actions</div>

        <div className="action-list">
          {actions.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--adm-ink-mute)', fontSize: 13 }}>
              No actions yet. Add one below.
            </div>
          )}

          {actions.map((a, idx) => (
            <article key={idx} className="action-card">
              <div className="head">
                <span className="order">{idx + 1}</span>
                <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>{a.type.replace('_', ' ')}</strong>
                <span className="spacer" />
                <button type="button" onClick={() => moveAction(idx, 'up')} disabled={idx === 0}>↑</button>
                <button type="button" onClick={() => moveAction(idx, 'down')} disabled={idx === actions.length - 1}>↓</button>
                <button type="button" className="danger" onClick={() => removeAction(idx)}>✕</button>
              </div>

              {a.type === 'enroll_in_campaign' && (
                <div className="field">
                  <label>Campaign</label>
                  <select
                    value={a.campaign_id}
                    onChange={(e) => patchAction(idx, { type: 'enroll_in_campaign', campaign_id: e.target.value })}
                  >
                    <option value="">— Choose an active campaign —</option>
                    {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {campaigns.length === 0 && (
                    <span className="hint">No active campaigns. Create one in Campaigns first.</span>
                  )}
                </div>
              )}

              {a.type === 'assign_lead' && (
                <div className="field">
                  <label>Assign to</label>
                  <select
                    value={a.user_id}
                    onChange={(e) => patchAction(idx, { type: 'assign_lead', user_id: e.target.value })}
                  >
                    <option value="round_robin">Round-robin (next salesperson in rotation)</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>{m.user_id.slice(0, 8)}… ({m.role})</option>
                    ))}
                  </select>
                </div>
              )}

              {a.type === 'set_stage' && (
                <div className="field">
                  <label>Set lead stage to</label>
                  <select
                    value={a.stage}
                    onChange={(e) => patchAction(idx, { type: 'set_stage', stage: e.target.value as LeadStage })}
                  >
                    {LEAD_STAGES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
              )}

              {a.type === 'tag' && (
                <div className="field">
                  <label>Tag value</label>
                  <input
                    type="text"
                    value={a.value}
                    onChange={(e) => patchAction(idx, { type: 'tag', value: e.target.value })}
                    placeholder="vip"
                  />
                  <span className="hint">Stored on the lead&rsquo;s qualifier_payload.tags array.</span>
                </div>
              )}

              {a.type === 'notify_email' && (
                <>
                  <div className="field">
                    <label>To</label>
                    <input
                      type="email"
                      value={a.to}
                      onChange={(e) => patchAction(idx, { type: 'notify_email', to: e.target.value, subject: a.subject, body: a.body })}
                      placeholder="alerts@yourdealership.com"
                    />
                  </div>
                  <div className="field">
                    <label>Subject</label>
                    <input
                      type="text"
                      value={a.subject}
                      onChange={(e) => patchAction(idx, { type: 'notify_email', to: a.to, subject: e.target.value, body: a.body })}
                      placeholder="New {{source}} lead from {{contact_name}}"
                    />
                  </div>
                  <div className="field">
                    <label>Body</label>
                    <textarea
                      value={a.body}
                      onChange={(e) => patchAction(idx, { type: 'notify_email', to: a.to, subject: a.subject, body: e.target.value })}
                      placeholder="Got a new lead — see {{contact_name}} in the inbox."
                      rows={3}
                    />
                  </div>
                </>
              )}
            </article>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          {ACTION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className="step-add"
              style={{ flex: 'unset', padding: '8px 12px' }}
              onClick={() => addAction(t)}
            >
              + {t.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
