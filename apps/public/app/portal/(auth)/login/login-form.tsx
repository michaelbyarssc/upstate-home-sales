'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@uhs/db/browser';

type Mode = 'password' | 'magic';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setSubmitting(true);
    const supabase = createClient();

    if (mode === 'password') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setSubmitting(false);
      if (error) {
        setErr(error.message);
        return;
      }
      router.push(next);
      router.refresh();
    } else {
      // Magic link flow.
      const redirectTo = `${window.location.origin}/portal/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      setSubmitting(false);
      if (error) {
        setErr(error.message);
        return;
      }
      setInfo(`Check ${email} for a sign-in link.`);
    }
  }

  return (
    <form onSubmit={onSubmit} className="portal-form">
      <div className="field">
        <label htmlFor="lf-email">Email</label>
        <input
          id="lf-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      {mode === 'password' && (
        <div className="field">
          <label htmlFor="lf-password">Password</label>
          <input
            id="lf-password"
            type="password"
            required
            autoComplete="current-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
      )}

      {err && <div className="err">{err}</div>}
      {info && <div className="ok">{info}</div>}

      <button type="submit" disabled={submitting}>
        {submitting
          ? mode === 'password' ? 'Signing in…' : 'Sending link…'
          : mode === 'password' ? 'Sign in' : 'Send sign-in link'}
      </button>

      <div className="portal-divider">or</div>

      <button
        type="button"
        className="magic-link-btn"
        onClick={() => {
          setMode((m) => (m === 'password' ? 'magic' : 'password'));
          setErr(null);
          setInfo(null);
        }}
      >
        {mode === 'password' ? 'Sign in with email link' : 'Sign in with password'}
      </button>

      {mode === 'password' && (
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <Link href="/portal/reset" style={{ fontSize: 12, color: 'var(--c-ink-mute)' }}>
            Forgot your password?
          </Link>
        </div>
      )}
    </form>
  );
}
