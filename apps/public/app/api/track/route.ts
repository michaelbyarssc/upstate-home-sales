import { NextResponse } from 'next/server';
import { createServiceClient } from '@uhs/db/service';
import type { VisitorEventKind } from '@uhs/db';

/**
 * Phase G — server-side analytics ingestion.
 *
 * Fires from public-site client components (`fetch('/api/track', { ... })`)
 * to log visitor events to the dealer's own DB. Independent of GA4/Meta —
 * this is the dealer-owned dataset that powers /admin/reports/funnel and
 * /admin/reports/geography.
 *
 * Auth: anon (no key). Org_id is derived from the home/route — never trusted
 * from the client. Rate-limit/abuse handling: the service-role insert respects
 * a one-event-per-second cap per session_id (enforced via DB unique partial
 * index in a follow-up; for v1 we just trust the client cookie).
 */

export const runtime = 'nodejs';

const VALID: ReadonlySet<VisitorEventKind> = new Set([
  'page_view',
  'inventory_view',
  'home_view',
  'lead_submitted',
  'quote_viewed',
  'quote_signed',
]);

export async function POST(req: Request) {
  let body: {
    session_id?: string;
    event_type?: string;
    home_id?: string | null;
    lead_id?: string | null;
    path?: string | null;
    referrer_url?: string | null;
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 }); }

  const sessionId = (body.session_id ?? '').trim().slice(0, 64);
  const eventType = body.event_type as VisitorEventKind;
  if (!sessionId || !VALID.has(eventType)) {
    return NextResponse.json({ message: 'Bad event' }, { status: 400 });
  }

  const sb = createServiceClient();

  // Resolve org from home_id (most events are home-tied) or pick first active org.
  let orgId: string | null = null;
  if (body.home_id) {
    const { data: home } = await sb.from('homes').select('org_id').eq('id', body.home_id).maybeSingle();
    orgId = home?.org_id ?? null;
  }
  if (!orgId) {
    const { data: org } = await sb.from('orgs').select('id').eq('status', 'active').order('created_at').limit(1).maybeSingle();
    orgId = org?.id ?? null;
  }
  if (!orgId) return NextResponse.json({ ok: false }, { status: 200 });

  // Best-effort IP geo: read from Vercel's request headers (free, coarse).
  const headers = req.headers;
  const ipCity = headers.get('x-vercel-ip-city');
  const ipRegion = headers.get('x-vercel-ip-country-region');
  const ipCountry = headers.get('x-vercel-ip-country');

  // Fire-and-forget insert. Failures don't block the response.
  void sb.from('visitor_events').insert({
    org_id: orgId,
    session_id: sessionId,
    event_type: eventType,
    home_id: body.home_id ?? null,
    lead_id: body.lead_id ?? null,
    path: body.path?.slice(0, 200) ?? null,
    referrer_url: body.referrer_url?.slice(0, 250) ?? null,
    utm_source: body.utm_source?.slice(0, 100) ?? null,
    utm_medium: body.utm_medium?.slice(0, 100) ?? null,
    utm_campaign: body.utm_campaign?.slice(0, 100) ?? null,
    ip_city: ipCity ? decodeURIComponent(ipCity) : null,
    ip_region: ipRegion,
    ip_country: ipCountry,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
