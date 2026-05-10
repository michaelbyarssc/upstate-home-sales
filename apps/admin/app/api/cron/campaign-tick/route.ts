import { NextResponse } from 'next/server';
import { runCampaignTick } from '../../../../lib/campaign-tick';

/**
 * Vercel Cron entry point for the drip-campaign processor.
 *
 * Vercel Cron sends an `Authorization: Bearer ${CRON_SECRET}` header. We
 * accept either that or a `?secret=` query param matching the same env var.
 * If `CRON_SECRET` is unset we refuse so a missing config doesn't open the
 * endpoint to the public.
 */
export const dynamic = 'force-dynamic';

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${secret}`) return true;

  const url = new URL(req.url);
  if (url.searchParams.get('secret') === secret) return true;

  return false;
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const result = await runCampaignTick();
  return NextResponse.json({ ok: true, ...result });
}

// Allow POST too — Vercel Cron uses GET, but local curl scripts often POST.
export const POST = GET;
