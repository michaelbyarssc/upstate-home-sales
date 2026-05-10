'use client';

import { useState, useTransition } from 'react';
import type { Campaign, CampaignStep, CampaignStatus } from '@uhs/db';
import {
  updateCampaign,
  setCampaignStatus,
  addCampaignStep,
  updateCampaignStep,
  deleteCampaignStep,
  moveCampaignStep,
} from '../actions';

const TRIGGER_EVENTS = [
  { value: '', label: 'Manual only' },
  { value: 'lead.created', label: 'When a lead is created' },
  { value: 'lead.stage.changed', label: "When a lead's stage changes" },
  { value: 'quote.sent', label: 'When a quote is sent' },
  { value: 'quote.signed', label: 'When a quote is signed' },
];

const DELAY_UNITS = [
  { unit: 'minutes', sec: 60 },
  { unit: 'hours', sec: 3600 },
  { unit: 'days', sec: 86_400 },
  { unit: 'weeks', sec: 604_800 },
];

function delayToHuman(seconds: number): { value: number; unit: string } {
  if (seconds === 0) return { value: 0, unit: 'minutes' };
  for (const u of [...DELAY_UNITS].reverse()) {
    if (seconds >= u.sec && seconds % u.sec === 0) return { value: seconds / u.sec, unit: u.unit };
  }
  return { value: Math.round(seconds / 60), unit: 'minutes' };
}
function humanToDelay(value: number, unit: string): number {
  const u = DELAY_UNITS.find((d) => d.unit === unit) ?? DELAY_UNITS[2];
  return Math.max(0, Math.round(value)) * u.sec;
}

type Props = { campaign: Campaign; steps: CampaignStep[] };

export function CampaignEditor({ campaign, steps: initialSteps }: Props) {
  const [draftCampaign, setDraftCampaign] = useState(campaign);
  const [steps, setSteps] = useState(initialSteps);
  const [savingMeta, setSavingMeta] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function saveMeta() {
    setSavingMeta(true);
    setErr(null);
    try {
      let triggerFilter: Record<string, unknown> | null = null;
      if (typeof draftCampaign.trigger_filter === 'string' && (draftCampaign.trigger_filter as unknown as string).trim()) {
        try {
          triggerFilter = JSON.parse(draftCampaign.trigger_filter as unknown as string);
        } catch {
          throw new Error('Trigger filter must be valid JSON.');
        }
      } else if (draftCampaign.trigger_filter && typeof draftCampaign.trigger_filter === 'object') {
        triggerFilter = draftCampaign.trigger_filter;
      }
      await updateCampaign(campaign.id, {
        name: draftCampaign.name,
        description: draftCampaign.description,
        channel: draftCampaign.channel,
        trigger_event: draftCampaign.trigger_event,
        trigger_filter: triggerFilter,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingMeta(false);
    }
  }

  function changeStatus(status: CampaignStatus) {
    setDraftCampaign((c) => ({ ...c, status }));
    startTransition(async () => {
      try {
        await setCampaignStatus(campaign.id, status);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Status update failed');
      }
    });
  }

  async function addStep() {
    setErr(null);
    try {
      await addCampaignStep(campaign.id, {
        delay_seconds: steps.length === 0 ? 0 : 86_400, // 1st step immediate, others default 1 day
        subject: campaign.channel === 'email' ? 'Subject…' : null,
        body: '',
      });
      // Refresh by reload — server action revalidates the path.
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add step');
    }
  }

  async function patchStep(id: string, patch: Partial<{ delay_seconds: number; subject: string | null; body: string }>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    try {
      await updateCampaignStep(id, campaign.id, patch);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Step update failed');
    }
  }

  async function removeStep(id: string) {
    if (!confirm('Delete this step?')) return;
    try {
      await deleteCampaignStep(id, campaign.id);
      setSteps((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function moveStep(id: string, direction: 'up' | 'down') {
    try {
      await moveCampaignStep(id, campaign.id, direction);
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Move failed');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {err && (
        <div style={{ background: '#fee', color: '#a00', padding: 10, borderRadius: 6, fontSize: 13 }}>{err}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="text"
              value={draftCampaign.name}
              onChange={(e) => setDraftCampaign((c) => ({ ...c, name: e.target.value }))}
              onBlur={saveMeta}
              style={{
                font: '700 22px/1.2 var(--f-display, var(--f-body))',
                border: 'none', background: 'transparent', padding: 0, color: 'var(--adm-ink)',
                width: 'min(420px, 100%)',
              }}
            />
            <span className={`pill ${draftCampaign.status}`}>{draftCampaign.status}</span>
            <span className={`pill ${draftCampaign.channel}`}>{draftCampaign.channel}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {draftCampaign.status === 'draft' && (
            <button onClick={() => changeStatus('active')} className="status-btn primary">Activate</button>
          )}
          {draftCampaign.status === 'active' && (
            <button onClick={() => changeStatus('paused')} className="status-btn">Pause</button>
          )}
          {draftCampaign.status === 'paused' && (
            <button onClick={() => changeStatus('active')} className="status-btn primary">Resume</button>
          )}
          {draftCampaign.status !== 'archived' && (
            <button onClick={() => changeStatus('archived')} className="status-btn">Archive</button>
          )}
        </div>
      </div>

      {/* Settings */}
      <div className="auto-form" style={{ maxWidth: 'none' }}>
        <div className="auto-section-head">Settings</div>

        <div className="field">
          <label htmlFor="cf-desc">Description</label>
          <input
            id="cf-desc"
            type="text"
            value={draftCampaign.description ?? ''}
            onChange={(e) => setDraftCampaign((c) => ({ ...c, description: e.target.value || null }))}
            onBlur={saveMeta}
            placeholder="Optional internal note"
          />
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="cf-channel">Channel</label>
            <select
              id="cf-channel"
              value={draftCampaign.channel}
              onChange={(e) => {
                setDraftCampaign((c) => ({ ...c, channel: e.target.value as 'email' | 'sms' }));
                startTransition(() => updateCampaign(campaign.id, { channel: e.target.value as 'email' | 'sms' }).catch((err) => setErr(err.message)));
              }}
            >
              <option value="email">Email</option>
              <option value="sms">SMS (consent required)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="cf-trigger">Auto-enroll trigger</label>
            <select
              id="cf-trigger"
              value={draftCampaign.trigger_event ?? ''}
              onChange={(e) => {
                const next = e.target.value || null;
                setDraftCampaign((c) => ({ ...c, trigger_event: next }));
                startTransition(() => updateCampaign(campaign.id, { trigger_event: next }).catch((err) => setErr(err.message)));
              }}
            >
              {TRIGGER_EVENTS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="cf-filter">Trigger filter (JSON)</label>
          <textarea
            id="cf-filter"
            value={
              typeof draftCampaign.trigger_filter === 'string'
                ? (draftCampaign.trigger_filter as unknown as string)
                : draftCampaign.trigger_filter
                  ? JSON.stringify(draftCampaign.trigger_filter, null, 2)
                  : ''
            }
            onChange={(e) =>
              setDraftCampaign((c) => ({ ...c, trigger_filter: e.target.value as unknown as Record<string, unknown> | null }))
            }
            onBlur={saveMeta}
            placeholder={'{ "source": "quote_form" }'}
            rows={3}
          />
          <span className="hint">
            Optional. Only enroll leads matching all keys.
          </span>
        </div>

        {savingMeta && <span style={{ fontSize: 12, color: 'var(--adm-ink-mute)' }}>Saving…</span>}
      </div>

      {/* Steps */}
      <div className="auto-form" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div className="auto-section-head" style={{ margin: 0 }}>Steps ({steps.length})</div>
          <span className="hint" style={{ fontSize: 12 }}>
            Step 1 delay = time after enrollment. Step 2+ delay = time after the prior step sent.
          </span>
        </div>

        <div className="step-list">
          {steps.map((s, idx) => {
            const d = delayToHuman(Number(s.delay_seconds));
            return (
              <article key={s.id} className="step-card">
                <div className="head">
                  <span className="order">{s.step_order}</span>
                  <span className="delay-row">
                    Wait
                    <input
                      type="number"
                      min={0}
                      value={d.value}
                      onChange={(e) => patchStep(s.id, { delay_seconds: humanToDelay(Number(e.target.value), d.unit) })}
                    />
                    <select
                      value={d.unit}
                      onChange={(e) => patchStep(s.id, { delay_seconds: humanToDelay(d.value, e.target.value) })}
                    >
                      {DELAY_UNITS.map((u) => <option key={u.unit} value={u.unit}>{u.unit}</option>)}
                    </select>
                  </span>
                  <span className="spacer" />
                  <button type="button" onClick={() => moveStep(s.id, 'up')} disabled={idx === 0} title="Move up">↑</button>
                  <button type="button" onClick={() => moveStep(s.id, 'down')} disabled={idx === steps.length - 1} title="Move down">↓</button>
                  <button type="button" className="danger" onClick={() => removeStep(s.id)} title="Delete">✕</button>
                </div>

                {campaign.channel === 'email' && (
                  <div className="field">
                    <label>Subject</label>
                    <input
                      type="text"
                      value={s.subject ?? ''}
                      onChange={(e) => patchStep(s.id, { subject: e.target.value || null })}
                      placeholder="Subject line"
                    />
                  </div>
                )}

                <div className="field">
                  <label>{campaign.channel === 'email' ? 'Body' : 'Message'}</label>
                  <textarea
                    value={s.body}
                    onChange={(e) => patchStep(s.id, { body: e.target.value })}
                    placeholder={campaign.channel === 'email' ? 'Hi {{first_name}}, …' : '{{first_name}}, …'}
                    rows={4}
                  />
                  <div className="var-chips">
                    <code>{'{{contact_name}}'}</code>
                    <code>{'{{first_name}}'}</code>
                    <code>{'{{org_name}}'}</code>
                  </div>
                </div>
              </article>
            );
          })}

          <button type="button" className="step-add" onClick={addStep}>
            + Add step
          </button>
        </div>
      </div>

      <style>{`
        .status-btn {
          background: #fff; color: var(--adm-ink); border: 1px solid var(--adm-line);
          padding: 8px 14px; border-radius: 6px; font: 500 13px/1 var(--f-body); cursor: pointer;
        }
        .status-btn:hover { border-color: var(--adm-ink); }
        .status-btn.primary {
          background: var(--adm-accent); color: #fff; border-color: var(--adm-accent);
        }
        .status-btn.primary:hover { filter: brightness(0.95); }
      `}</style>
    </div>
  );
}
