'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { createClient } from '@uhs/db/browser';
import { formatCents, type Lead, type LeadMessage, type LeadStage, type LineItem, type MessageChannel, type MessageKind } from '@uhs/db';
import {
  postMessage,
  updateLeadStage,
  updateLeadAssignee,
  toggleLeadHot,
} from './actions';
import { enrollLeadInCampaign } from '../../automations/campaigns/actions';
import { QuoteFormModal } from './quote-form-modal';
import { InvoiceFormModal } from './invoice-form-modal';

type EnrollmentRow = {
  id: string;
  campaign_id: string;
  status: string;
  current_step: number;
  next_send_at: string | null;
  campaigns?: { name: string; channel: string } | { name: string; channel: string }[] | null;
};

type Props = {
  lead: Lead & { homes?: { name: string; stock_no: string; listed_price_cents: number } | null };
  initialMessages: LeadMessage[];
  members: Array<{ user_id: string; role: string }>;
  campaigns: Array<{ id: string; name: string; channel: string; status: string }>;
  initialEnrollments: EnrollmentRow[];
  defaultLineItems: LineItem[];
};

type ComposeKind = 'email' | 'sms' | 'note' | 'call';

const STAGES: LeadStage[] = ['new', 'in_progress', 'quoted', 'won', 'lost'];

export function LeadDetailClient({ lead: initialLead, initialMessages, members, campaigns, initialEnrollments, defaultLineItems }: Props) {
  const [lead, setLead] = useState(initialLead);
  const [messages, setMessages] = useState<LeadMessage[]>(initialMessages);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>(initialEnrollments);
  const [enrolling, setEnrolling] = useState(false);
  const [compose, setCompose] = useState<ComposeKind>('email');
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [, startTransition] = useTransition();
  const timelineRef = useRef<HTMLDivElement>(null);

  async function handleEnroll(campaignId: string) {
    if (!campaignId) return;
    setEnrolling(true);
    setErr(null);
    try {
      await enrollLeadInCampaign(campaignId, lead.id);
      // Optimistically add to local list (server will revalidate too).
      const camp = campaigns.find((c) => c.id === campaignId);
      setEnrollments((prev) => {
        const existing = prev.find((e) => e.campaign_id === campaignId);
        if (existing) return prev.map((e) => e.campaign_id === campaignId ? { ...e, status: 'active' } : e);
        return [
          ...prev,
          {
            id: 'temp-' + campaignId,
            campaign_id: campaignId,
            status: 'active',
            current_step: 0,
            next_send_at: new Date().toISOString(),
            campaigns: camp ? { name: camp.name, channel: camp.channel } : null,
          },
        ];
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Enroll failed');
    } finally {
      setEnrolling(false);
    }
  }

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

  function handleQuoteCreated(token: string) {
    const publicBase = window.location.origin.replace(':3001', ':3000');
    const url = `${publicBase}/q/${token}`;
    try { navigator.clipboard.writeText(url); } catch {}
    setLead((l) => ({ ...l, stage: 'quoted' }));
    setShowQuoteModal(false);
    setErr(null);
    alert(`Quote created and link copied:\n${url}`);
  }

  function handleInvoiceCreated(token: string, invoiceNumber: number) {
    const publicBase = window.location.origin.replace(':3001', ':3000');
    const url = `${publicBase}/inv/${token}`;
    try { navigator.clipboard.writeText(url); } catch {}
    setShowInvoiceModal(false);
    setErr(null);
    alert(`Invoice #${invoiceNumber} created and link copied:\n${url}`);
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
              <>
                <button
                  type="button"
                  onClick={() => setShowQuoteModal(true)}
                  style={{
                    background: 'var(--adm-accent)', color: '#fff',
                    border: 'none', padding: '7px 14px', borderRadius: 6,
                    cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  }}
                >
                  + Quote
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(true)}
                  style={{
                    background: '#0f1c29', color: '#fff',
                    border: 'none', padding: '7px 14px', borderRadius: 6,
                    cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  }}
                >
                  + Invoice
                </button>
              </>
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

            {(lead.utm_source || lead.utm_campaign || lead.gclid || lead.fbclid || lead.referrer_url) && (
              <>
                <h4>Attribution</h4>
                {lead.utm_source && <div className="kv"><span className="k">utm_source</span><span>{lead.utm_source}</span></div>}
                {lead.utm_medium && <div className="kv"><span className="k">utm_medium</span><span>{lead.utm_medium}</span></div>}
                {lead.utm_campaign && <div className="kv"><span className="k">utm_campaign</span><span>{lead.utm_campaign}</span></div>}
                {lead.utm_term && <div className="kv"><span className="k">utm_term</span><span>{lead.utm_term}</span></div>}
                {lead.utm_content && <div className="kv"><span className="k">utm_content</span><span>{lead.utm_content}</span></div>}
                {lead.gclid && <div className="kv"><span className="k">gclid</span><span style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{lead.gclid}</span></div>}
                {lead.fbclid && <div className="kv"><span className="k">fbclid</span><span style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{lead.fbclid}</span></div>}
                {lead.landing_path && <div className="kv"><span className="k">Landing</span><span style={{ fontSize: 11, wordBreak: 'break-all' }}>{lead.landing_path}</span></div>}
                {lead.referrer_url && <div className="kv"><span className="k">Referrer</span><span style={{ fontSize: 11, wordBreak: 'break-all' }}>{lead.referrer_url}</span></div>}
              </>
            )}

            <h4>Campaigns</h4>
            {enrollments.length > 0 && (
              <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {enrollments.map((e) => {
                  const c = Array.isArray(e.campaigns) ? e.campaigns[0] : e.campaigns;
                  return (
                    <div key={e.id} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <span>{c?.name ?? '—'}</span>
                      <span style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: 0.4,
                        background: e.status === 'active' ? '#dcfce7' : e.status === 'errored' ? '#fee2e2' : '#f3f4f6',
                        color: e.status === 'active' ? '#166534' : e.status === 'errored' ? '#991b1b' : '#6b7280',
                      }}>{e.status}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {campaigns.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--adm-ink-mute)' }}>
                No active campaigns. <Link href="/automations/campaigns/new" style={{ color: 'var(--adm-accent)' }}>Create one</Link>.
              </div>
            ) : (
              <select
                disabled={enrolling}
                value=""
                onChange={(e) => handleEnroll(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', fontSize: 12, marginBottom: 4 }}
              >
                <option value="">{enrolling ? 'Enrolling…' : '+ Enroll in campaign'}</option>
                {campaigns.map((c) => (
                  <option
                    key={c.id}
                    value={c.id}
                    disabled={enrollments.some((e) => e.campaign_id === c.id && e.status === 'active')}
                  >
                    {c.name} ({c.channel})
                  </option>
                ))}
              </select>
            )}

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

      {showQuoteModal && lead.home_id && lead.homes && (
        <QuoteFormModal
          leadId={lead.id}
          orgId={lead.org_id}
          homeId={lead.home_id}
          homeName={lead.homes.name}
          defaultLineItems={defaultLineItems}
          onClose={() => setShowQuoteModal(false)}
          onCreated={handleQuoteCreated}
        />
      )}

      {showInvoiceModal && lead.home_id && lead.homes && (
        <InvoiceFormModal
          leadId={lead.id}
          orgId={lead.org_id}
          homeId={lead.home_id}
          homeName={lead.homes.name}
          defaultLineItems={defaultLineItems}
          onClose={() => setShowInvoiceModal(false)}
          onCreated={handleInvoiceCreated}
        />
      )}
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
