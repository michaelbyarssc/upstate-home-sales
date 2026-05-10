'use client';

import { useState, type FormEvent } from 'react';
import { getAttribution } from '../../../lib/attribution';

type Props = { homeId: string; stockNo: string; homeName: string };

export function KioskContactForm({ homeId, stockNo, homeName }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      const body = {
        home_id: homeId,
        stock_no: stockNo,
        contact_name: String(fd.get('name') ?? '').trim(),
        email: String(fd.get('email') ?? '').trim(),
        phone: String(fd.get('phone') ?? '').trim(),
        message: `Walked up at the ${homeName} kiosk.`,
        sms_consent: false,
        source: 'walkin' as const,
        ...(getAttribution() ?? {}),
        landing_path: '/kiosk/' + stockNo,
      };
      if (!body.contact_name) throw new Error('Please enter your name.');
      if (!body.email && !body.phone) throw new Error('Leave an email or phone so we can reach you.');
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message ?? 'Submission failed.');
      }
      setOk(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (ok) {
    return (
      <div className="ok">
        <strong>Thanks!</strong> A salesperson will follow up shortly.
      </div>
    );
  }

  return (
    <form className="kiosk-form" onSubmit={onSubmit}>
      <div>
        <label htmlFor="kf-name">Name</label>
        <input id="kf-name" name="name" type="text" required autoComplete="name" />
      </div>
      <div>
        <label htmlFor="kf-phone">Phone</label>
        <input id="kf-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" />
      </div>
      <div>
        <label htmlFor="kf-email">Email</label>
        <input id="kf-email" name="email" type="email" inputMode="email" autoComplete="email" />
      </div>
      {err && <div className="err">{err}</div>}
      <button type="submit" className="kiosk-btn" disabled={submitting} style={{ marginTop: 4 }}>
        {submitting ? 'Sending…' : 'Get in touch'}
      </button>
    </form>
  );
}
