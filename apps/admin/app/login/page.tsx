import { LoginForm } from './login-form';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  // Only allow same-origin relative paths as the post-login redirect target.
  // Anything containing "://" or starting with "//" or not starting with "/"
  // is rejected to prevent open-redirects (and to avoid 404s from malformed
  // values left over from upstream redirects).
  const rawNext = searchParams.next ?? '/dashboard';
  const isSafeNext =
    rawNext.startsWith('/') &&
    !rawNext.startsWith('//') &&
    !rawNext.includes('://');
  const next = isSafeNext ? rawNext : '/dashboard';

  return (
    <div className="auth-wrap">
      <div className="auth-left">
        <div className="brand">
          <div className="mark">U</div>
          <div className="name">
            Upstate Home <em>Sales</em>
          </div>
        </div>
        <div>
          <h1>
            The dealer dashboard,
            <br />
            <em>finally not awful.</em>
          </h1>
          <p>
            Manage inventory, capture leads, send quotes — all from one place. Built for SC and NC
            dealers, multi-tenant ready.
          </p>
        </div>
        <div className="auth-foot-version">v0.1 · admin · build {new Date().toISOString().slice(0, 10)}</div>
      </div>
      <div className="auth-right">
        <div className="auth-card">
          <h2>Sign in</h2>
          <p className="sub">Use your dealer email. We&apos;ll route you to your dealership after login.</p>
          {searchParams.error ? <div className="auth-error">{searchParams.error}</div> : null}
          <LoginForm next={next} />
          <p className="auth-foot">
            By signing in you agree to the dealer terms. Not a dealer yet?{' '}
            <a href="mailto:hello@upstatehomesales.com">Request access</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
