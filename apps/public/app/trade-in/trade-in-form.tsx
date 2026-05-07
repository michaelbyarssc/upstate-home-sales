'use client';

import { useState, type FormEvent } from 'react';

export function TradeInForm() {
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      const body = {
        contact_name: String(fd.get('name') ?? '').trim(),
        email: String(fd.get('email') ?? '').trim(),
        phone: String(fd.get('phone') ?? '').trim(),
        year: numOrNull(fd.get('year')),
        make: strOrNull(fd.get('make')),
        model: strOrNull(fd.get('model')),
        size_w: numOrNull(fd.get('size_w')),
        size_l: numOrNull(fd.get('size_l')),
        condition_notes: strOrNull(fd.get('notes')),
      };
      if (!body.contact_name || !body.email) throw new Error('Please include your name and email.');
      const res = await fetch('/api/trade-ins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? 'Submission failed.');
      }
      e.currentTarget.reset();
      setMsg({ kind: 'success', text: 'Thanks — we\'ll review and reach out within a business day.' });
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Submission failed.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="quote-form" onSubmit={onSubmit}>
      <h3>About you</h3>
      <div className="field">
        <label className="label" htmlFor="ti-name">Your name</label>
        <input className="input" id="ti-name" name="name" required autoComplete="name" />
      </div>
      <div className="field">
        <label className="label" htmlFor="ti-email">Email</label>
        <input className="input" id="ti-email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="field">
        <label className="label" htmlFor="ti-phone">Phone</label>
        <input className="input" id="ti-phone" name="phone" type="tel" autoComplete="tel" />
      </div>

      <h3 style={{ marginTop: 'var(--s-6)' }}>About the home</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
        <div className="field">
          <label className="label" htmlFor="ti-year">Year</label>
          <input className="input" id="ti-year" name="year" type="number" min={1960} max={2100} />
        </div>
        <div className="field">
          <label className="label" htmlFor="ti-make">Manufacturer</label>
          <input className="input" id="ti-make" name="make" placeholder="Clayton, Champion, etc." />
        </div>
        <div className="field">
          <label className="label" htmlFor="ti-model">Model (if known)</label>
          <input className="input" id="ti-model" name="model" />
        </div>
        <div className="field">
          <label className="label">Size (W × L, ft)</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="input" name="size_w" type="number" min={0} placeholder="W" />
            <input className="input" name="size_l" type="number" min={0} placeholder="L" />
          </div>
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="ti-notes">Condition notes</label>
        <textarea className="textarea" id="ti-notes" name="notes" rows={4}
          placeholder="Year of last roof, AC age, anything notable about the interior or exterior." />
      </div>

      <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%' }}>
        {submitting ? 'Sending…' : 'Submit for review'}
      </button>
      {msg && <div className={`form-msg ${msg.kind}`}>{msg.text}</div>}
    </form>
  );
}

function strOrNull(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
