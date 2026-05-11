import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type OrgIntegration } from '@uhs/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Connect Google Business Profile' };

export default async function GmbConnectPage() {
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
  const supabase = createClient();
  let existing: OrgIntegration | null = null;
  if (orgId) {
    const { data } = await supabase
      .from('org_integrations')
      .select('*')
      .eq('org_id', orgId)
      .eq('kind', 'gmb')
      .maybeSingle();
    existing = (data ?? null) as OrgIntegration | null;
  }

  const oauthConfigured = !!(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-header">
        <div className="eyebrow">
          <Link href="/marketing/integrations" style={{ color: 'inherit', textDecoration: 'none' }}>
            ← Integrations
          </Link>
        </div>
        <h1>Connect Google Business Profile</h1>
        <p>
          Authorize Upstate Home Sales to pull your reviews + post your replies via Google&rsquo;s
          Business Profile API. Done through Google&rsquo;s OAuth consent screen — your password never
          touches our servers.
        </p>
      </div>

      <section
        className="card"
        style={{ marginTop: 24, padding: 24, background: '#fff', border: '1px solid var(--adm-line)', borderRadius: 8 }}
      >
        {!oauthConfigured && (
          <div
            style={{
              padding: 12,
              borderRadius: 6,
              background: '#faf0ee',
              color: '#a53a2c',
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            <strong>Set up required.</strong> An admin must set{' '}
            <code>GOOGLE_OAUTH_CLIENT_ID</code>, <code>GOOGLE_OAUTH_CLIENT_SECRET</code>, and{' '}
            <code>GOOGLE_OAUTH_REDIRECT_URI</code> on the admin Vercel project before connecting.
          </div>
        )}

        {existing?.status === 'connected' ? (
          <>
            <h3 style={{ marginBottom: 8 }}>Already connected</h3>
            <p style={{ color: 'var(--adm-ink-mute)', marginBottom: 16 }}>
              Connected{' '}
              {existing.connected_at && new Date(existing.connected_at).toLocaleDateString()}. The daily
              cron syncs reviews automatically; replies you draft in{' '}
              <Link href="/marketing/reviews">/marketing/reviews</Link> are pushed to Google on the next run.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href="/api/marketing/gmb/start"
                className="btn"
                style={{
                  background: 'var(--adm-bg)',
                  color: 'var(--adm-ink)',
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--adm-line)',
                  fontSize: 13,
                  textDecoration: 'none',
                }}
              >
                Reconnect
              </a>
              <Link
                href="/marketing/reviews"
                className="btn btn-primary"
                style={{ background: 'var(--adm-accent)', color: '#fff', padding: '8px 14px', borderRadius: 6, fontSize: 13, textDecoration: 'none' }}
              >
                View reviews →
              </Link>
            </div>
          </>
        ) : (
          <>
            <h3 style={{ marginBottom: 8 }}>Ready to connect</h3>
            <p style={{ color: 'var(--adm-ink-mute)', marginBottom: 16 }}>
              You&rsquo;ll be redirected to Google to pick the location and approve the{' '}
              <code>business.manage</code> scope. After approval you&rsquo;ll land back here with the
              integration active.
            </p>
            <a
              href="/api/marketing/gmb/start"
              className="btn btn-primary"
              aria-disabled={!oauthConfigured}
              style={{
                display: 'inline-block',
                background: oauthConfigured ? 'var(--adm-accent)' : 'var(--adm-line)',
                color: '#fff',
                padding: '10px 16px',
                borderRadius: 6,
                fontSize: 14,
                textDecoration: 'none',
                pointerEvents: oauthConfigured ? 'auto' : 'none',
              }}
            >
              Continue with Google
            </a>
          </>
        )}

        {existing?.status === 'error' && existing.status_detail && (
          <div style={{ marginTop: 16, padding: 10, borderRadius: 4, background: '#faf0ee', color: '#a53a2c', fontSize: 12 }}>
            <strong>Last sync error:</strong> {existing.status_detail}
          </div>
        )}
      </section>

      <p style={{ marginTop: 16, fontSize: 12, color: 'var(--adm-ink-mute)' }}>
        Your OAuth refresh token is encrypted with pgcrypto using the platform&rsquo;s
        <code>INTEGRATION_ENCRYPTION_KEY</code>; it&rsquo;s never readable from the dashboard.
      </p>
    </div>
  );
}
