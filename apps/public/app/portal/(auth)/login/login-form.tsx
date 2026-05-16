'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@uhs/db/browser';

type Mode = 'magic' | 'password';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('magic');
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

    if (mode === 'magic') {
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
      setInfo(`Sign-in link sent. Open ${email} on this device and tap the link — it logs you in automatically.`);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setSubmitting(false);
      if (error) {
        setErr(error.message);
        return;
      }
      router.push(next);
      router.refresh();
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
          inputMode="email"
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
          ? mode === 'magic' ? 'Sending link…' : 'Signing in…'
          : mode === 'magic' ? 'Email me a sign-in link' : 'Sign in'}
      </button>

      <div className="portal-divider">or</div>

      <button
        type="button"
        className="magic-link-btn"
        onClick={() => {
          setMode((m) => (m === 'magic' ? 'password' : 'magic'));
          setErr(null);
          setInfo(null);
        }}
      >
        {mode === 'magic' ? 'Sign in with password instead' : 'Sign in with email link instead'}
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
