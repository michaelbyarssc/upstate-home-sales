'use client';

import { useState, type FormEvent } from 'react';

export function ContactForm() {
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      const body = {
        home_id: null,
        contact_name: String(fd.get('name') ?? '').trim(),
        email: String(fd.get('email') ?? '').trim(),
        phone: String(fd.get('phone') ?? '').trim(),
        message: String(fd.get('message') ?? '').trim() || null,
        sms_consent: fd.get('sms_consent') === 'on',
        source: 'contact_form',
      };
      if (!body.contact_name || !body.email) throw new Error('Please include your name and email.');
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // home_id null is allowed for general inquiries (Week 4 will support it).
        body: JSON.stringify({ ...body, home_id: 'general' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? 'Submission failed.');
      }
      e.currentTarget.reset();
      setMsg({ kind: 'success', text: 'Thanks — we&rsquo;ll be in touch within a business day.' });
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Submission failed.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="quote-form" onSubmit={onSubmit}>
      <h3>Send us a message</h3>
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
        <label className="label" htmlFor="cf-msg">How can we help?</label>
        <textarea className="textarea" id="cf-msg" name="message" rows={5} required />
      </div>
      <label className="consent">
        <input type="checkbox" name="sms_consent" />
        <span>I agree to receive text messages about my inquiry. Reply STOP to opt out.</span>
      </label>
      <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%' }}>
        {submitting ? 'Sending…' : 'Send message'}
      </button>
      {msg && <div className={`form-msg ${msg.kind}`}>{msg.text}</div>}
    </form>
  );
}
