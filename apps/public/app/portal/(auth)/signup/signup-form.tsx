'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@uhs/db/browser';

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);

    if (!name.trim()) return setErr('Please enter your full name.');
    if (password.length < 8) return setErr('Password must be at least 8 characters.');

    setSubmitting(true);
    const supabase = createClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/portal/auth/callback?next=/portal`,
        data: { full_name: name.trim(), phone: phone.trim() || null },
      },
    });

    if (error) {
      setSubmitting(false);
      setErr(error.message);
      return;
    }

    // If email confirmation is OFF in Supabase config, signUp returns a session
    // and we can land the buyer straight on the dashboard. Otherwise show the
    // "check your email" message and let the callback finish the flow.
    if (data.session) {
      // Server action creates the buyers row using the auth user we just created.
      try {
        await fetch('/portal/api/buyers/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ full_name: name.trim(), email, phone: phone.trim() || null }),
        });
      } catch {
        /* non-fatal — callback will retry */
      }
      router.push('/portal');
      router.refresh();
    } else {
      setSubmitting(false);
      setInfo(`We sent a confirmation link to ${email}. Click it to finish signing up.`);
    }
  }

  return (
    <form onSubmit={onSubmit} className="portal-form">
      <div className="field">
        <label htmlFor="sf-name">Full name</label>
        <input
          id="sf-name"
          type="text"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Marlena Pope"
        />
      </div>
      <div className="field">
        <label htmlFor="sf-email">Email</label>
        <input
          id="sf-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="marlena@example.com"
        />
      </div>
      <div className="field">
        <label htmlFor="sf-phone">Phone (optional)</label>
        <input
          id="sf-phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(803) 555-1234"
        />
      </div>
      <div className="field">
        <label htmlFor="sf-password">Password</label>
        <input
          id="sf-password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
      </div>

      {err && <div className="err">{err}</div>}
      {info && <div className="ok">{info}</div>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Create account'}
      </button>

      <p style={{ marginTop: 4, fontSize: 11, color: 'var(--c-ink-mute)', textAlign: 'center', lineHeight: 1.4 }}>
        By creating an account you agree to receive transactional emails from your salesperson.
        We never sell your information.
      </p>
    </form>
  );
}
