import { NextResponse } from 'next/server';
import { createServiceClient } from '@uhs/db/service';

/**
 * Phase G — daily GMB review sync stub.
 *
 * Scheduled by Vercel cron via apps/admin/vercel.json. For each org with a
 * connected GMB integration:
 *   1. Decrypt the stored OAuth refresh token
 *   2. Hit Google Business Profile API: accounts/{accountId}/locations/{loc}/reviews
 *   3. Upsert into gmb_reviews on (org_id, gmb_review_id)
 *   4. Update org_integrations.last_sync_at
 *
 * For v1 we ship the scaffolding + DB write path. The actual GBP API call
 * needs a verified Google OAuth client + the refresh token to be persisted
 * via the /marketing/integrations/gmb/connect OAuth flow (next iteration).
 *
 * Auth: Vercel-cron header check + CRON_SECRET to keep it un-pingable.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  // Vercel cron sends a `Authorization: Bearer <CRON_SECRET>` header.
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get('authorization');
  if (expected && got !== `Bearer ${expected}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sb = createServiceClient();
  const { data: connectedGmb } = await sb
    .from('org_integrations')
    .select('id, org_id, config, last_sync_at, status')
    .eq('kind', 'gmb')
    .eq('status', 'connected');

  const integrations = connectedGmb ?? [];
  let attempted = 0;
  let synced = 0;
  let errors: Array<{ org_id: string; error: string }> = [];

  for (const intg of integrations) {
    attempted++;
    try {
      // STUB: until the OAuth flow lands, no real API call. We mark the
      // sync as attempted so the dealer sees recency in the integrations
      // panel. Real fetch goes here in iteration 2.
      const reviewsFetched: Array<{
        gmb_review_id: string; rating: number; comment: string | null;
        author_name: string | null; reviewed_at: string;
      }> = [];

      if (reviewsFetched.length > 0) {
        const rows = reviewsFetched.map((r) => ({
          org_id: intg.org_id,
          gmb_review_id: r.gmb_review_id,
          rating: r.rating,
          comment: r.comment,
          author_name: r.author_name,
          reviewed_at: r.reviewed_at,
        }));
        await sb.from('gmb_reviews').upsert(rows, { onConflict: 'org_id,gmb_review_id' });
        synced += rows.length;
      }

      await sb
        .from('org_integrations')
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
    errors,
    note: integrations.length === 0
      ? 'No connected GMB integrations to sync.'
      : 'Stub run — wire OAuth flow at /marketing/integrations/gmb/connect to enable live fetches.',
  });
}
