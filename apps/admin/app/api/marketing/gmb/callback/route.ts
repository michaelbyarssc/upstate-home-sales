import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@uhs/db/service';

/**
 * PR 3.1 — Google Business Profile OAuth callback.
 *
 * 1. Validates the state cookie.
 * 2. Exchanges the auth code for tokens via Google's token endpoint.
 * 3. Lists the user's GMB accounts → picks the first one (or the one the
 *    dealer's admin already set in org_integrations.config.account_id).
 * 4. Encrypts the refresh_token with the platform's pgcrypto helper and
 *    upserts org_integrations.
 * 5. Redirects back to /marketing/integrations/gmb/connect.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'uhs_gmb_oauth_state';

function redirectErr(reason: string) {
  return NextResponse.redirect(
    new URL(`/marketing/integrations/gmb/connect?error=${encodeURIComponent(reason)}`,
      process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001'),
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) return redirectErr(`Google declined: ${error}`);
  if (!code || !stateParam) return redirectErr('Missing code or state.');

  // Validate state cookie.
  const stateCookie = cookies().get(STATE_COOKIE)?.value;
  if (!stateCookie || stateCookie !== stateParam) {
    return redirectErr('State mismatch — possible CSRF.');
  }
  let parsed: { org_id: string; nonce: string; ts: number };
  try {
    parsed = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf8'));
  } catch {
    return redirectErr('State unreadable.');
  }
  if (!parsed.org_id) return redirectErr('Missing org in state.');
  if (Date.now() - parsed.ts > 10 * 60 * 1000) return redirectErr('State expired.');

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !redirectUri || !encKey) {
    return redirectErr('Server misconfigured (missing OAuth or encryption env).');
  }

  // Exchange code for tokens.
  let tokenJson: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!tokenRes.ok) {
      const txt = await tokenRes.text().catch(() => '');
      return redirectErr(`Token exchange failed (${tokenRes.status}): ${txt.slice(0, 200)}`);
    }
    tokenJson = await tokenRes.json();
  } catch (e) {
    return redirectErr(`Token exchange threw: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  if (!tokenJson.refresh_token) {
    return redirectErr('Google did not return a refresh_token — re-run with prompt=consent.');
  }

  // List the user's GMB accounts.
  let accountId: string | null = null;
  try {
    const acctRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (acctRes.ok) {
      const acctJson = (await acctRes.json()) as { accounts?: Array<{ name: string }> };
      // accounts[].name is like "accounts/1234567890"
      accountId = acctJson.accounts?.[0]?.name?.split('/').pop() ?? null;
    }
  } catch {
    // Non-fatal — admin can paste account_id manually in the integrations form.
  }

  const sb = createServiceClient();
  const credsBlob = JSON.stringify({
    refresh_token: tokenJson.refresh_token,
    scope: tokenJson.scope,
  });

  // Encrypt via the existing helper. Returns a bytea (base64-encoded by PostgREST).
  const { data: encResult, error: encErr } = await sb.rpc('encrypt_credentials', {
    p_plain: credsBlob,
    p_key: encKey,
  });
  if (encErr) return redirectErr(`Encryption failed: ${encErr.message}`);

  // Upsert org_integrations.
  const { error: upErr } = await sb
    .from('org_integrations')
    .upsert(
      {
        org_id: parsed.org_id,
        kind: 'gmb',
        credentials_enc: encResult,
        config: { account_id: accountId, connected_at: new Date().toISOString() },
        status: 'connected',
        status_detail: null,
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,kind' },
    );
  if (upErr) return redirectErr(`Save failed: ${upErr.message}`);

  // Clear state cookie.
  cookies().delete(STATE_COOKIE);

  return NextResponse.redirect(
    new URL('/marketing/integrations/gmb/connect?connected=1',
      process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001'),
  );
}
