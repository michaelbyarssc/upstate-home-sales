import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { ACTIVE_ORG_COOKIE } from '@uhs/db';

/**
 * PR 3.1 — kick off the Google Business Profile OAuth flow.
 *
 * Reads the active org from the session cookie, mints a signed state cookie
 * (httpOnly, sameSite=lax) that the callback validates, and 302s the user
 * to Google's consent screen. The state cookie encodes the org_id so the
 * callback can look up which org to attach the integration to.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'uhs_gmb_oauth_state';
const STATE_MAX_AGE_S = 60 * 10; // 10 minutes

export async function GET() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { message: 'GMB OAuth is not configured (missing GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_REDIRECT_URI).' },
      { status: 503 },
    );
  }

  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
  if (!orgId) {
    return NextResponse.json({ message: 'No active org. Pick one first.' }, { status: 400 });
  }

  const nonce = randomBytes(24).toString('hex');
  const statePayload = { org_id: orgId, nonce, ts: Date.now() };
  const stateStr = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

  cookies().set(STATE_COOKIE, stateStr, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: STATE_MAX_AGE_S,
  });

  // Google Business Profile API requires the `business.manage` scope.
  // access_type=offline + prompt=consent so we always get a refresh_token.
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: 'https://www.googleapis.com/auth/business.manage',
    state: stateStr,
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return NextResponse.redirect(url);
}
