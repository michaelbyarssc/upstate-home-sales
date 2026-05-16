import Link from 'next/link';
import { SignupForm } from './signup-form';

export const metadata = { title: 'Create account · Buyer portal' };

export default function PortalSignupPage() {
  return (
    <div className="portal-auth-card">
      <Link href="/" className="brand">Upstate Home <em>Center</em></Link>
      <p className="tag">Buyer portal</p>
      <h1>Create your account</h1>
      <p className="lede">
        Save homes you like, upload financing documents, and track your purchase from quote to delivery.
      </p>

      <SignupForm />

      <div className="portal-auth-foot">
        Already have an account? <Link href="/portal/login">Sign in →</Link>
      </div>
    </div>
  );
}
