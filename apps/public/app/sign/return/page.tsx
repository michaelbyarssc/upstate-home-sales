import '../[sessionToken]/sign.css';

export const metadata = { title: 'Signing complete' };

/** SignWell's embedded_signing_redirect_url points here (see
 *  apps/admin/app/(app)/documents/generate-actions.ts). The kiosk advances on
 *  the embed's `completed` event, so this page is only ever seen briefly
 *  inside the iframe or by a remote signer after finishing. */
export default function SignReturnPage() {
  return (
    <main className="sign-shell">
      <div className="sign-card">
        <div className="sign-mark">U</div>
        <h1>Signing complete ✓</h1>
        <p>
          Thank you — your signature has been recorded. You can close this window; your
          salesperson will take it from here.
        </p>
      </div>
    </main>
  );
}
