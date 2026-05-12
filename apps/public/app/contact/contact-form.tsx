'use client';

import { useState, type FormEvent } from 'react';
import { getAttribution } from '../../lib/attribution';

type InitialDesign = {
  designId: string;
  homeId: string;
  homeName: string;
  stockNo: string;
  selectionSummary: string;
};

export function ContactForm({ initialDesign }: { initialDesign?: InitialDesign | null }) {
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const defaultMessage = initialDesign
    ? [
        `I'd like a quote for the ${initialDesign.homeName} (#${initialDesign.stockNo}) based on this design.`,
        '',
        initialDesign.selectionSummary || '(default configuration)',
      ].join('\n')
    : '';

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      const body = {
        // Tie to the design's home when present; fall back to 'general' for
        // free-form inquiries (the leads endpoint accepts both).
        home_id: initialDesign?.homeId ?? 'general',
        source_design_id: initialDesign?.designId || null,
        stock_no: initialDesign?.stockNo,
        contact_name: String(fd.get('name') ?? '').trim(),
        email: String(fd.get('email') ?? '').trim(),
        phone: String(fd.get('phone') ?? '').trim(),
        message: String(fd.get('message') ?? '').trim() || null,
        sms_consent: fd.get('sms_consent') === 'on',
        source: initialDesign ? 'quote_form' : 'contact_form',
        ...(getAttribution() ?? {}),
      };
      if (!body.contact_name || !body.email) throw new Error('Please include your name and email.');
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? 'Submission failed.');
      }
      e.currentTarget.reset();
      setMsg({ kind: 'success', text: 'Thanks — we’ll be in touch within a business day.' });
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Submission failed.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="quote-form" onSubmit={onSubmit}>
      <h3>{initialDesign ? `Get a quote for the ${initialDesign.homeName}` : 'Send us a message'}</h3>
      <div className="field">
        <label className="label" htmlFor="cf-name">Name</label>
        <input className="input" id="cf-name" name="name" required autoComplete="name" />
      </div>
      <div className="field">
        <label className="label" htmlFor="cf-email">Email</label>
        <input className="input" id="cf-email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="field">
        <label className="label" htmlFor="cf-phone">Phone (optional)</label>
        <input className="input" id="cf-phone" name="phone" type="tel" autoComplete="tel" />
      </div>
      <div className="field">
        <label className="label" htmlFor="cf-msg">
          {initialDesign ? 'Anything else we should know?' : 'How can we help?'}
        </label>
        <textarea
          className="textarea"
          id="cf-msg"
          name="message"
          rows={initialDesign ? 6 : 5}
          required={!initialDesign}
          defaultValue={defaultMessage}
        />
      </div>
      <label className="consent">
        <input type="checkbox" name="sms_consent" />
        <span>I agree to receive text messages about my inquiry. Reply STOP to opt out.</span>
      </label>
      <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%' }}>
        {submitting ? 'Sending…' : initialDesign ? 'Request quote' : 'Send message'}
      </button>
      {msg && <div className={`form-msg ${msg.kind}`}>{msg.text}</div>}
    </form>
  );
}
