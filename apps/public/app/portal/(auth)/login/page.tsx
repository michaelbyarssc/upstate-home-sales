import Link from 'next/link';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in · Buyer portal' };

export default function PortalLoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <div className="portal-auth-card">
      <Link href="/" className="brand">Upstate Home <em>Sales</em></Link>
      <p className="tag">Buyer portal</p>
      <h1>Welcome back</h1>
      <p className="lede">Sign in to see saved homes, documents, and the status of your purchase.</p>

      <LoginForm next={searchParams.next ?? '/portal'} />

      <div className="portal-auth-foot">
        New here? <Link href="/portal/signup">Create an account →</Link>
      </div>
    </div>
  );
}
