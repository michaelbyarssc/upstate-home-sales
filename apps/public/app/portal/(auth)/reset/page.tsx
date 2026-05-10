import Link from 'next/link';
import { ResetForm } from './reset-form';

export const metadata = { title: 'Reset password · Buyer portal' };

export default function PortalResetPage() {
  return (
    <div className="portal-auth-card">
      <Link href="/" className="brand">Upstate Home <em>Sales</em></Link>
      <p className="tag">Buyer portal</p>
      <h1>Reset your password</h1>
      <p className="lede">
        Enter the email you signed up with and we&rsquo;ll send a link to set a new password.
      </p>

      <ResetForm />

      <div className="portal-auth-foot">
        Remembered it? <Link href="/portal/login">Back to sign in →</Link>
      </div>
    </div>
  );
}
