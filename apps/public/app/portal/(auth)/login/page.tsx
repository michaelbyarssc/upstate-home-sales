import Link from 'next/link';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in · Buyer portal' };

export default function PortalLoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <div className="portal-auth-card">
      <Link href="/" className="brand">Upstate Home <em>Center</em></Link>
      <p className="tag">Buyer portal</p>
      <h1>Sign in</h1>
      <p className="lede">
        Enter your email and we&rsquo;ll send a one-tap sign-in link. No password needed.
      </p>

      <LoginForm next={searchParams.next ?? '/portal'} />

      <div className="portal-auth-foot">
        New here? <Link href="/portal/signup">Create an account →</Link>
      </div>
    </div>
  );
}
