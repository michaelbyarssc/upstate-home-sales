'use client';

import { useState, useTransition } from 'react';
import type { LeadMilestone, MilestoneStatus } from '@uhs/db';
import {
  createMilestone,
  deleteMilestone,
  inviteBuyerToPortal,
  suggestHomeForLead,
  updateMilestoneStatus,
} from './actions';

type HomeOption = { id: string; name: string; stock_no: string };
type Props = {
  leadId: string;
  buyerLinked: boolean;
  buyerName: string | null;
  homes: HomeOption[];
  initialMilestones: LeadMilestone[];
  initialSuggestionsCount: number;
};

const STATUS_OPTIONS: Array<{ value: MilestoneStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
];

export function BuyerPortalPanel({
  leadId,
  buyerLinked,
  buyerName,
  homes,
  initialMilestones,
  initialSuggestionsCount,
}: Props) {
  const [milestones, setMilestones] = useState(initialMilestones);
  const [suggestionsCount, setSuggestionsCount] = useState(initialSuggestionsCount);
  const [, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Suggest-home form state
  const [homeId, setHomeId] = useState('');
  const [note, setNote] = useState('');
  const [suggesting, setSuggesting] = useState(false);

  // Milestone form state
  const [msTitle, setMsTitle] = useState('');
  const [msBody, setMsBody] = useState('');
  const [msStatus, setMsStatus] = useState<MilestoneStatus>('pending');
  const [msDue, setMsDue] = useState('');
  const [creating, setCreating] = useState(false);

  // Invite form state
  const [inviting, setInviting] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);

  async function onSuggest(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!homeId) return setErr('Pick a home to suggest.');
    setSuggesting(true);
    const r = await suggestHomeForLead({ leadId, homeId, note: note.trim() || null });
    setSuggesting(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setSuggestionsCount((n) => n + 1);
    setHomeId('');
    setNote('');
  }

  async function onCreateMilestone(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!msTitle.trim()) return setErr('Milestone title is required.');
    setCreating(true);
    try {
      await createMilestone({
        leadId,
        title: msTitle.trim(),
        body: msBody.trim() || null,
        status: msStatus,
        dueAt: msDue ? new Date(msDue).toISOString() : null,
      });
      // Optimistic add — page revalidation will fetch the real one with id
      setMilestones((prev) => [
        ...prev,
        {
          id: 'temp-' + Date.now(),
          lead_id: leadId,
          org_id: '',
          title: msTitle.trim(),
          body: msBody.trim() || null,
          status: msStatus,
          sort_order: prev.length,
          due_at: msDue ? new Date(msDue).toISOString() : null,
          completed_at: msStatus === 'complete' ? new Date().toISOString() : null,
          created_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
      setMsTitle('');
      setMsBody('');
      setMsStatus('pending');
      setMsDue('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  function onChangeStatus(id: string, status: MilestoneStatus) {
    setMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, status, completed_at: status === 'complete' ? new Date().toISOString() : null } : m)));
    start(async () => {
      try {
        await updateMilestoneStatus({ id, leadId, status });
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Update failed');
      }
    });
  }

  function onDelete(id: string) {
    if (!confirm('Delete this milestone?')) return;
    setMilestones((prev) => prev.filter((m) => m.id !== id));
    start(async () => {
      try {
        await deleteMilestone({ id, leadId });
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Delete failed');
      }
    });
  }

  async function onInvite() {
    setErr(null);
    setInviting(true);
    try {
      const r = await inviteBuyerToPortal({ leadId });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setInviteSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invite failed');
    } finally {
      setInviting(false);
    }
  }

  return (
    <section style={{
      marginTop: 24,
      background: '#fff',
      border: '1px solid var(--adm-line)',
      borderRadius: 8,
      padding: 20,
    }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ font: '600 18px/1 var(--f-body)', margin: 0 }}>Buyer portal</h2>
          <div style={{ fontSize: 13, color: 'var(--adm-ink-mute)', marginTop: 4 }}>
            {buyerLinked
              ? <>Linked to <strong>{buyerName ?? 'buyer'}</strong>. They see suggestions and milestones in <code>/portal</code>.</>
              : inviteSent
                ? <>Invite sent. The buyer will be linked automatically when they follow the magic link.</>
                : 'Not linked yet. Send a magic-link invite, or wait for the buyer to sign up at /portal/signup with this lead’s email.'}
          </div>
        </div>
        {!buyerLinked && (
          <button
            type="button"
            onClick={onInvite}
            disabled={inviting || inviteSent}
            style={{
              background: inviteSent ? 'var(--adm-bg)' : 'var(--adm-accent)',
              color: inviteSent ? 'var(--adm-ink-mute)' : '#fff',
              border: 'none',
              padding: '7px 12px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: inviting || inviteSent ? 'default' : 'pointer',
              opacity: inviting ? 0.6 : 1,
            }}
          >
            {inviteSent ? 'Invite sent' : inviting ? 'Sending…' : 'Invite to portal'}
          </button>
        )}
      </header>

      {err && <div style={{ background: '#fee', color: '#a00', padding: 10, borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
        {/* Suggest a home */}
        <div>
          <h3 style={{ font: '600 13px/1 var(--f-body)', textTransform: 'uppercase', letterSpacing: 0.04, color: 'var(--adm-ink-mute)', marginBottom: 8 }}>
            Suggest a home ({suggestionsCount} so far)
          </h3>
          <form onSubmit={onSuggest} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <select
              value={homeId}
              onChange={(e) => setHomeId(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid var(--adm-line)', borderRadius: 6, fontSize: 13 }}
            >
              <option value="">— Pick a home —</option>
              {homes.map((h) => (
                <option key={h.id} value={h.id}>{h.name} ({h.stock_no})</option>
              ))}
            </select>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note: 'matches your budget', 'has the open kitchen you wanted'…"
              rows={2}
              style={{ padding: '7px 10px', border: '1px solid var(--adm-line)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <button
              type="submit"
              disabled={suggesting || !homeId || !buyerLinked}
              title={!buyerLinked ? 'Buyer must sign up first' : undefined}
              style={{ background: 'var(--adm-accent)', color: '#fff', border: 'none', padding: '7px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', alignSelf: 'flex-start', opacity: suggesting || !buyerLinked ? 0.6 : 1 }}
            >
              {suggesting ? 'Suggesting…' : 'Suggest to buyer'}
            </button>
          </form>
        </div>

        {/* Milestones */}
        <div>
          <h3 style={{ font: '600 13px/1 var(--f-body)', textTransform: 'uppercase', letterSpacing: 0.04, color: 'var(--adm-ink-mute)', marginBottom: 8 }}>
            Milestones ({milestones.length})
          </h3>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {milestones.map((m) => (
              <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 8px', background: 'var(--adm-bg)', borderRadius: 4 }}>
                <select
                  value={m.status}
                  onChange={(e) => onChangeStatus(m.id, e.target.value as MilestoneStatus)}
                  style={{ padding: 2, fontSize: 11, border: '1px solid var(--adm-line)', borderRadius: 3, background: '#fff' }}
                >
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <span style={{ flex: 1, textDecoration: m.status === 'complete' ? 'line-through' : 'none', color: m.status === 'complete' ? 'var(--adm-ink-mute)' : 'var(--adm-ink)' }}>
                  {m.title}
                </span>
                <button onClick={() => onDelete(m.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--adm-ink-mute)', padding: 2 }}>×</button>
              </li>
            ))}
          </ol>
          <form onSubmit={onCreateMilestone} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--adm-line)' }}>
            <input
              value={msTitle}
              onChange={(e) => setMsTitle(e.target.value)}
              placeholder="Milestone title (e.g. 'Financing approved')"
              style={{ padding: '7px 10px', border: '1px solid var(--adm-line)', borderRadius: 6, fontSize: 13 }}
            />
            <textarea
              value={msBody}
              onChange={(e) => setMsBody(e.target.value)}
              placeholder="Optional details for the buyer"
              rows={2}
              style={{ padding: '7px 10px', border: '1px solid var(--adm-line)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                value={msStatus}
                onChange={(e) => setMsStatus(e.target.value as MilestoneStatus)}
                style={{ padding: '6px 8px', border: '1px solid var(--adm-line)', borderRadius: 6, fontSize: 12, flex: 1 }}
              >
                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <input
                type="date"
                value={msDue}
                onChange={(e) => setMsDue(e.target.value)}
                style={{ padding: '6px 8px', border: '1px solid var(--adm-line)', borderRadius: 6, fontSize: 12, flex: 1 }}
              />
            </div>
            <button
              type="submit"
              disabled={creating || !msTitle.trim()}
              style={{ background: 'var(--adm-accent)', color: '#fff', border: 'none', padding: '7px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', alignSelf: 'flex-start', opacity: creating || !msTitle.trim() ? 0.6 : 1 }}
            >
              {creating ? 'Adding…' : '+ Add milestone'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
