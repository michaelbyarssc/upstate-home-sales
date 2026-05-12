import { NextResponse } from 'next/server';
import { createServiceClient } from '@uhs/db/service';

/**
 * Phase G — daily Google Business Profile sync.
 *
 * For each org with kind=gmb status=connected:
 *   1. Decrypt the stored OAuth refresh token (pgcrypto + INTEGRATION_ENCRYPTION_KEY)
 *   2. Exchange refresh_token → access_token via Google's token endpoint
 *   3. List GBP locations (if account_id is configured), fetch reviews for each
 *   4. Upsert into gmb_reviews on (org_id, gmb_review_id)
 *   5. For any local reply_text that isn't in sync with GBP, call
 *      accounts.locations.reviews.updateReply
 *   6. Update org_integrations.last_sync_at
 *
 * Auth: Vercel-cron Bearer + CRON_SECRET.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type LocalReview = {
  id: string;
  gmb_review_id: string;
  reply_text: string | null;
  replied_at: string | null;
};

type GoogleReview = {
  name: string;
  reviewId: string;
  reviewer: { displayName?: string; profilePhotoUrl?: string };
  starRating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE';
  comment?: string;
  createTime: string;
  reviewReply?: { comment: string; updateTime: string };
};

const RATING_MAP: Record<GoogleReview['starRating'], number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
};

async function exchangeRefreshToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string };
  return j.access_token ?? null;
}

async function listLocations(accessToken: string, accountId: string): Promise<string[]> {
  // Page-1 only for now — most dealers have <10 locations on GBP.
  const res = await fetch(
    `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations?pageSize=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return [];
  const j = (await res.json()) as { locations?: Array<{ name: string }> };
  // location.name = "accounts/123/locations/456"; we just need the id.
  return (j.locations ?? []).map((l) => l.name.split('/').pop() ?? '').filter(Boolean);
}

async function listReviews(accessToken: string, accountId: string, locationId: string): Promise<GoogleReview[]> {
  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews?pageSize=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return [];
  const j = (await res.json()) as { reviews?: GoogleReview[] };
  return j.reviews ?? [];
}

async function pushReply(
  accessToken: string,
  accountId: string,
  locationId: string,
  reviewId: string,
  comment: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews/${reviewId}/reply`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ comment }),
    },
  );
  if (res.ok) return { ok: true };
  const txt = await res.text().catch(() => '');
  return { ok: false, error: `${res.status}: ${txt.slice(0, 200)}` };
}

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get('authorization');
  if (expected && got !== `Bearer ${expected}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sb = createServiceClient();
  const { data: connectedGmb } = await sb
    .from('org_integrations')
    .select('id, org_id, credentials_enc, config, last_sync_at, status')
    .eq('kind', 'gmb')
    .eq('status', 'connected');

  const integrations = connectedGmb ?? [];
  let attempted = 0;
  let synced = 0;
  let repliesPushed = 0;
  const errors: Array<{ org_id: string; error: string }> = [];

  const encKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  const oauthReady = !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && encKey);

  for (const intg of integrations) {
    attempted++;
    try {
      if (!oauthReady) {
        throw new Error('GMB OAuth env not configured (GOOGLE_OAUTH_CLIENT_ID / SECRET / INTEGRATION_ENCRYPTION_KEY)');
      }
      if (!intg.credentials_enc) {
        throw new Error('No stored OAuth credentials — reconnect via /marketing/integrations/gmb/connect');
      }

      const { data: refreshBlob, error: decErr } = await sb.rpc('decrypt_credentials', {
        p_cipher: intg.credentials_enc,
        p_key: encKey,
      });
      if (decErr) throw new Error(`decrypt: ${decErr.message}`);
      const creds = JSON.parse((refreshBlob as string) ?? '{}') as { refresh_token?: string };
      if (!creds.refresh_token) throw new Error('Empty refresh_token in stored credentials');

      const accessToken = await exchangeRefreshToken(creds.refresh_token);
      if (!accessToken) throw new Error('Token refresh returned no access_token');

      const accountId = (intg.config as Record<string, unknown> | null)?.account_id as string | undefined;
      if (!accountId) throw new Error('No GMB account_id configured');

      const locationIds = await listLocations(accessToken, accountId);
      if (locationIds.length === 0) {
        // No locations; not an error per se, but we record it.
        await sb.from('org_integrations')
          .update({ last_sync_at: new Date().toISOString(), status: 'connected', status_detail: 'No GMB locations under this account.' })
          .eq('id', intg.id);
        continue;
      }

      for (const locationId of locationIds) {
        const reviews = await listReviews(accessToken, accountId, locationId);

        if (reviews.length > 0) {
          const rows = reviews.map((r) => ({
            org_id: intg.org_id,
            gmb_review_id: r.reviewId,
            rating: RATING_MAP[r.starRating] ?? 0,
            comment: r.comment ?? null,
            author_name: r.reviewer?.displayName ?? null,
            author_photo_url: r.reviewer?.profilePhotoUrl ?? null,
            reviewed_at: r.createTime,
          }));
          const { error: upErr } = await sb
            .from('gmb_reviews')
            .upsert(rows, { onConflict: 'org_id,gmb_review_id' });
          if (upErr) throw upErr;
          synced += rows.length;
        }

        // Push any local replies that GBP doesn't yet reflect.
        const remoteRepliesById = new Map<string, string>();
        for (const r of reviews) {
          if (r.reviewReply?.comment) remoteRepliesById.set(r.reviewId, r.reviewReply.comment);
        }
        const { data: localReplies } = await sb
          .from('gmb_reviews')
          .select('id, gmb_review_id, reply_text, replied_at')
          .eq('org_id', intg.org_id)
          .not('reply_text', 'is', null);
        for (const lr of (localReplies ?? []) as LocalReview[]) {
          if (!lr.reply_text) continue;
          const remote = remoteRepliesById.get(lr.gmb_review_id);
          if (remote === lr.reply_text) continue;
          const r = await pushReply(accessToken, accountId, locationId, lr.gmb_review_id, lr.reply_text);
          if (r.ok) repliesPushed++;
          else console.warn('[gmb-sync] reply push failed', lr.gmb_review_id, r.error);
        }
      }

      await sb.from('org_integrations')
        .update({ last_sync_at: new Date().toISOString(), status: 'connected', status_detail: null })
        .eq('id', intg.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      errors.push({ org_id: intg.org_id, error: msg });
      await sb
        .from('org_integrations')
        .update({ status: 'error', status_detail: msg })
        .eq('id', intg.id);
    }
  }

  return NextResponse.json({
    ok: true,
    integrations_attempted: attempted,
    reviews_synced: synced,
    replies_pushed: repliesPushed,
    errors,
  });
}
