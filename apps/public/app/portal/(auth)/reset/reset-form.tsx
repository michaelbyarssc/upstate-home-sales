'use client';

import { useState } from 'react';
import { createClient } from '@uhs/db/browser';

export function ResetForm() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setSubmitting(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/portal/auth/callback?next=/portal/profile`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setSubmitting(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setInfo(`If ${email} is registered, a reset link is on its way.`);
  }

  return (
    <form onSubmit={onSubmit} className="portal-form">
      <div className="field">
        <label htmlFor="rf-email">Email</label>
        <input
          id="rf-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {err && <div className="err">{err}</div>}
      {info && <div className="ok">{info}</div>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  );
}
