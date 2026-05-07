'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { createClient } from '@uhs/db/browser';
import { formatCents, type Lead, type LeadMessage, type LeadStage, type MessageChannel, type MessageKind } from '@uhs/db';
import {
  postMessage,
  updateLeadStage,
  updateLeadAssignee,
  toggleLeadHot,
  createQuote,
} from './actions';

type Props = {
  lead: Lead & { homes?: { name: string; stock_no: string; listed_price_cents: number } | null };
  initialMessages: LeadMessage[];
  members: Array<{ user_id: string; role: string }>;
};

type ComposeKind = 'email' | 'sms' | 'note' | 'call';

const STAGES: LeadStage[] = ['new', 'in_progress', 'quoted', 'won', 'lost'];

export function LeadDetailClient({ lead: initialLead, initialMessages, members }: Props) {
  const [lead, setLead] = useState(initialLead);
  const [messages, setMessages] = useState<LeadMessage[]>(initialMessages);
  const [compose, setCompose] = useState<ComposeKind>('email');
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const timelineRef = useRef<HTMLDivElement>(null);

  // Realtime: subscribe to new lead_messages for this lead.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`lead-${lead.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lead_messages', filter: `lead_id=eq.${lead.id}` },
        (payload) => {
          const m = payload.new as unknown as LeadMessage;
          setMessages((prev) => (prev.find((x) => x.id === m.id) ? prev : [...prev, m]));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [lead.id]);

  // Auto-scroll on new messages.
  useEffect(() => {
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  async function handleSend() {
    if (!body.trim()) return;
    setErr(null);
    const map: Record<ComposeKind, { kind: MessageKind; channel: MessageChannel | null }> = {
      email: { kind: 'outbound', channel: 'email' },
      sms:   { kind: 'outbound', channel: 'sms' },
      note:  { kind: 'note', channel: null },
      call:  { kind: 'note', channel: 'call' },
    };
    const { kind, channel } = map[compose];

    try {
      const inserted = await postMessage(lead.id, lead.org_id, kind, channel, body);
      // Inserted via realtime usually, but add immediately for snappy UX.
      setMessages((prev) => (prev.find((m) => m.id === inserted.id) ? prev : [...prev, inserted]));
      setBody('');
      // Auto-advance: first outbound on a 'new' lead → in_progress.
      if (kind === 'outbound' && lead.stage === 'new') {
        const updated = await updateLeadStage(lead.id, 'in_progress');
        setLead((l) => ({ ...l, stage: updated.stage }));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Send failed');
    }
  }

  async function handleStageChange(stage: LeadStage) {
    try {
      const updated = await updateLeadStage(lead.id, stage);
      setLead((l) => ({ ...l, stage: updated.stage }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed');
    }
  }

  async function handleAssigneeChange(userId: string) {
    try {
      const updated = await updateLeadAssignee(lead.id, userId === '' ? null : userId);
      setLead((l) => ({ ...l, assignee_id: updated.assignee_id }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed');
    }
  }

  async function handleCreateQuote() {
    if (!lead.home_id) return;
    try {
      const q = await createQuote({ leadId: lead.id, orgId: lead.org_id, homeId: lead.home_id });
      const publicBase = window.location.origin.replace(':3001', ':3000');
      const url = `${publicBase}/q/${q.public_token}`;
      // Best-effort copy to clipboard
      try { await navigator.clipboard.writeText(url); } catch {}
      setLead((l) => ({ ...l, stage: 'quoted' }));
      setErr(null);
      alert(`Quote created and link copied:\n${url}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Quote failed');
    }
  }

  async function handleHotToggle() {
    try {
      const updated = await toggleLeadHot(lead.id, !lead.is_hot);
      setLead((l) => ({ ...l, is_hot: updated.is_hot }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed');
    }
  }

  return (
    <div className="leads-grid">
      <div className="leads-list">
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--adm-line)' }}>
          <Link href="/leads" style={{ color: 'var(--adm-ink-mute)', fontSize: 13, textDecoration: 'none' }}>
            ← Inbox
          </Link>
        </div>
        <div className="leads-empty" style={{ padding: '40px 24px', fontSize: 13 }}>
          Inbox view stays open in another tab — realtime keeps both in sync.
        </div>
      </div>

      <div className="lead-detail">
        <div className="head">
          <div>
            <h2>
              {lead.is_hot && <span style={{ color: '#a53a2c', marginRight: 8 }}>🔥</span>}
              {lead.contact_name}
            </h2>
            <div className="sub">
              {lead.email ?? '—'} · {lead.phone ?? 'no phone'}
              {lead.homes ? ` · ${lead.homes.name} (${lead.homes.stock_no})` : ' · general inquiry'}
            </div>
          </div>
          <div className="actions">
            <button
              type="button"
              onClick={handleHotToggle}
              style={{
                background: lead.is_hot ? '#fff8e6' : '#fff',
                color: lead.is_hot ? '#8e6a1e' : 'var(--adm-ink-mute)',
                border: '1px solid var(--adm-line)',
                padding: '7px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
              }}
            >
              {lead.is_hot ? 'Marked hot' : 'Mark hot'}
            </button>
            {lead.home_id && (
              <button
                type="button"
                onClick={handleCreateQuote}
                style={{
                  background: 'var(--adm-accent)', color: '#fff',
                  border: 'none', padding: '7px 14px', borderRadius: 6,
                  cursor: 'pointer', fontSize: 13, fontWeight: 500,
                }}
              >
                + Create quote
              </button>
            )}
          </div>
        </div>

        <div className="body">
          <div className="timeline" ref={timelineRef}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--adm-ink-mute)', fontSize: 13 }}>No messages yet.</div>
            )}
            {messages.map((m) => (
              <Message key={m.id} m={m} />
            ))}
            <div className="compose">
              <div className="compose-tabs">
                {(['email', 'sms', 'note', 'call'] as ComposeKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={compose === k ? 'active' : ''}
                    onClick={() => setCompose(k)}
                  >
                    {k === 'email' ? '✉ Email' : k === 'sms' ? '💬 SMS' : k === 'note' ? '📌 Note' : '📞 Log call'}
                  </button>
                ))}
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  compose === 'note'
                    ? 'Internal note (not sent to the customer)…'
                    : compose === 'call'
                      ? 'Call summary…'
                      : `Reply via ${compose === 'email' ? 'email' : 'SMS'}…`
                }
              />
              <div className="row">
                {err && <span className="err">{err}</span>}
                <span style={{ alignSelf: 'center', fontSize: 11, color: 'var(--adm-ink-mute)' }}>
                  {compose === 'sms' && !lead.sms_consent && '⚠ no SMS consent on file'}
                </span>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!body.trim()}
                  style={{
                    background: 'var(--adm-accent)', color: '#fff',
                    border: 'none', padding: '8px 16px', borderRadius: 6,
                    fontWeight: 500, fontSize: 13, cursor: 'pointer',
                    opacity: body.trim() ? 1 : 0.5,
                  }}
                >
                  {compose === 'note' || compose === 'call' ? 'Save' : 'Send'}
                </button>
              </div>
            </div>
          </div>

          <aside className="meta-pane">
            <h4>Stage</h4>
            <select value={lead.stage} onChange={(e) => handleStageChange(e.target.value as LeadStage)}>
              {STAGES.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>

            <h4>Assignee</h4>
            <select value={lead.assignee_id ?? ''} onChange={(e) => handleAssigneeChange(e.target.value)}>
              <option value="">— Unassigned</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{shortId(m.user_id)} ({m.role})</option>
              ))}
            </select>

            <h4>Source</h4>
            <div className="kv"><span className="k">Channel</span><span>{lead.source.replace('_', ' ')}</span></div>
            <div className="kv"><span className="k">Created</span><span>{new Date(lead.created_at).toLocaleString()}</span></div>
            <div className="kv"><span className="k">SMS opt-in</span><span>{lead.sms_consent ? 'Yes' : 'No'}</span></div>

            {lead.homes && (
              <>
                <h4>Home</h4>
                <div className="kv"><span className="k">Stock #</span><span>{lead.homes.stock_no}</span></div>
                <div className="kv"><span className="k">Listed</span><span>{formatCents(lead.homes.listed_price_cents)}</span></div>
                <Link
                  href={`/inventory/${lead.home_id}`}
                  style={{ display: 'inline-block', marginTop: 10, fontSize: 12, color: 'var(--adm-accent)' }}
                >
                  Open inventory →
                </Link>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Message({ m }: { m: LeadMessage }) {
  const cls = m.kind === 'outbound' ? 'msg out' : m.kind === 'note' ? 'msg note' : m.kind === 'system' ? 'msg system' : 'msg';
  if (m.kind === 'system') {
    return <div className={cls}>{m.body} · {when(m.sent_at)}</div>;
  }
  const tag = m.kind === 'outbound' ? `Sent · ${m.channel ?? '—'}` : m.kind === 'note' ? 'Internal note' : `Inbound · ${m.channel ?? '—'}`;
  return (
    <div className={cls}>
      <div className="head">
        <span>{tag}</span>
        <span style={{ marginLeft: 'auto' }}>{when(m.sent_at)}</span>
      </div>
      <div className="body">{m.body}</div>
    </div>
  );
}

function when(s: string) {
  const d = new Date(s);
  return d.toLocaleString();
}

function shortId(s: string) {
  return s.slice(0, 8);
}
