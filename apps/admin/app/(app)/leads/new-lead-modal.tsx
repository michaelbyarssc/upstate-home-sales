'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { LeadSource } from '@uhs/db';
import { createLead } from './actions';

type HomeOption = { id: string; name: string; stock_no: string };

type Props = {
  orgId: string;
  homes: HomeOption[];
  onClose: () => void;
};

const SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'phone', label: 'Phone call' },
  { value: 'walkin', label: 'Walk-in' },
  { value: 'contact_form', label: 'Contact form' },
  { value: 'quote_form', label: 'Quote request' },
  { value: 'tradein', label: 'Trade-in' },
  { value: 'import', label: 'Import / other' },
];

export function NewLeadModal({ orgId, homes, onClose }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<LeadSource>('phone');
  const [homeId, setHomeId] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [note, setNote] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr('Name is required'); return; }
    setErr(null);

    startTransition(async () => {
      try {
        const lead = await createLead({
          orgId,
          contactName: name,
          email: email || null,
          phone: phone || null,
          source,
          homeId: homeId || null,
          smsConsent,
          note: note || null,
        });
        router.push(`/leads/${lead.id}`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to create lead');
      }
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Lead</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <label className="field">
              <span className="field-label">Name *</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoFocus />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="field">
                <span className="field-label">Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
              </label>
              <label className="field">
                <span className="field-label">Phone</span>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-5555" />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="field">
                <span className="field-label">Source</span>
                <select value={source} onChange={(e) => setSource(e.target.value as LeadSource)}>
                  {SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Home (optional)</span>
                <select value={homeId} onChange={(e) => setHomeId(e.target.value)}>
                  <option value="">— General inquiry</option>
                  {homes.map((h) => (
                    <option key={h.id} value={h.id}>{h.name} ({h.stock_no})</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)} />
              <span className="field-label" style={{ margin: 0 }}>SMS consent</span>
            </label>

            <label className="field">
              <span className="field-label">Initial note (optional)</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Context about this lead…" rows={3} />
            </label>

            {err && <div style={{ color: '#a53a2c', fontSize: 13 }}>{err}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
