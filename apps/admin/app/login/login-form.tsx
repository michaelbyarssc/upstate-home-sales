'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@uhs/db/browser';

type Mode = 'sign-in' | 'set-password' | 'forgot';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Detect recovery flow from the URL fragment that Supabase puts there
  // (`#access_token=...&type=recovery&...`) AND from query string error
  // codes. The fragment is auto-consumed by the browser client; reading
  // window.location.hash on mount is reliable regardless of listener timing.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const search = window.location.search.startsWith('?') ? window.location.search.slice(1) : '';
    const hashParams = new URLSearchParams(hash);
    const queryParams = new URLSearchParams(search);

    const isRecovery =
      hashParams.get('type') === 'recovery' || queryParams.get('type') === 'recovery';
    if (isRecovery) {
      setMode('set-password');
      setInfo('Set a new password for your account.');
    }
    const err = hashParams.get('error_description') || queryParams.get('error_description');
    if (err) setError(err);

    // Also subscribe to the event in case it fires after mount.
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('set-password');
        setInfo('Set a new password for your account.');
      }
    });

    // If we think this is a recovery flow but supabase couldn't establish a
    // session from the fragment (token consumed/expired), surface the issue
    // upfront instead of letting "Set password" submit fail with a vague
    // "Auth session missing!" message.
    if (isRecovery) {
      // Wait a tick for detectSessionInUrl to run.
      setTimeout(async () => {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setError(
            'This recovery link is no longer valid (already used or expired). ' +
              'Generate a new one.',
          );
        }
      }, 250);
    }

    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();

    if (mode === 'sign-in') {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        setSubmitting(false);
        return;
      }
      router.push(next);
      router.refresh();
      return;
    }

    if (mode === 'set-password') {
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        setSubmitting(false);
        return;
      }
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) {
        setError(updErr.message);
        setSubmitting(false);
        return;
      }
      setInfo('Password updated. Redirecting…');
      router.push(next);
      router.refresh();
      return;
    }

    if (mode === 'forgot') {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/login`
          : undefined;
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (resetErr) {
        setError(resetErr.message);
        setSubmitting(false);
        return;
      }
      setInfo('Check your email for the password reset link.');
      setSubmitting(false);
    }
  }

  const showEmail = mode !== 'set-password';
  const showPassword = mode !== 'forgot';
  const submitLabel =
    mode === 'set-password' ? 'Set password' :
    mode === 'forgot'       ? 'Send reset link' :
    'Sign in';
  const submittingLabel =
    mode === 'set-password' ? 'Saving…' :
    mode === 'forgot'       ? 'Sending…' :
    'Signing in…';

  return (
    <form onSubmit={onSubmit}>
      {showEmail && (
        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="input"
            placeholder="you@upstatehomesales.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      )}
      {showPassword && (
        <div className="field">
          <label className="label" htmlFor="password">
            {mode === 'set-password' ? 'New password' : 'Password'}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === 'set-password' ? 'new-password' : 'current-password'}
            required
            className="input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      )}
      {error ? <div className="auth-error">{error}</div> : null}
      {info ? <div className="auth-info">{info}</div> : null}
      <button type="submit" className="btn btn-pri" style={{ width: '100%' }} disabled={submitting}>
        {submitting ? submittingLabel : submitLabel}
      </button>
      <div style={{ marginTop: 14, fontSize: 13, textAlign: 'center' }}>
        {mode === 'sign-in' && (
          <button
            type="button"
            onClick={() => { setMode('forgot'); setError(null); setInfo(null); }}
            style={{ background: 'none', border: 'none', color: 'var(--adm-accent)', cursor: 'pointer', padding: 0 }}
          >
            Forgot password?
          </button>
        )}
        {mode !== 'sign-in' && (
          <button
            type="button"
            onClick={() => { setMode('sign-in'); setError(null); setInfo(null); }}
            style={{ background: 'none', border: 'none', color: 'var(--adm-accent)', cursor: 'pointer', padding: 0 }}
          >
            Back to sign in
          </button>
        )}
      </div>
    </form>
  );
}
