import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

/**
 * Sentry verification endpoint. Hits this URL to throw a deliberate error
 * server-side and confirm Sentry receives it.
 *
 *   GET /api/sentry-test           → captures + throws (Sentry issue + 500)
 *   GET /api/sentry-test?ok=1      → 200, no error
 *   GET /api/sentry-test?capture=1 → captures only (Sentry issue + 200)
 *
 * Captures explicitly via Sentry.captureException so we don't depend on
 * Next 14's auto-instrumentation (which needs the v9 onRequestError hook).
 */

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);

  if (url.searchParams.get('ok') === '1') {
    return NextResponse.json({ ok: true, message: 'Sentry test endpoint healthy' });
  }

  const err = new Error(`Sentry verification — server-side throw from /api/sentry-test (${new Date().toISOString()})`);

  // Always capture explicitly so it shows up regardless of auto-instrumentation.
  Sentry.captureException(err);
  // Force flush before the lambda returns; otherwise the event can be dropped.
  await Sentry.flush(2000);

  if (url.searchParams.get('capture') === '1') {
    return NextResponse.json({ captured: true, message: 'Error sent to Sentry; no throw' });
  }

  throw err;
}
