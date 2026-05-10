import { NextResponse } from 'next/server';

/**
 * Sentry verification endpoint. Hits this URL to throw a deliberate error
 * server-side and confirm Sentry receives it.
 *
 *   GET /api/sentry-test  → throws (becomes a Sentry issue)
 *   GET /api/sentry-test?ok=1 → 200, no error
 *
 * Safe to leave deployed; the only outcome is a Sentry issue that you can
 * resolve. Gated behind a query param so curiosity clicks don't spam.
 */

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('ok') === '1') {
    return NextResponse.json({ ok: true, message: 'Sentry test endpoint healthy' });
  }
  // Deliberate: this should appear in Sentry as a captured exception within
  // ~30s of the curl. Resolve it in Sentry once you've verified.
  throw new Error('Sentry verification — server-side throw from /api/sentry-test');
}
