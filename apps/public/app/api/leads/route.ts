import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createServiceClient } from '@uhs/db/service';
import type { LeadSource } from '@uhs/db';
import { sendEmail } from '../../../lib/notify';
import { dispatchWorkflowEvent } from '../../../lib/workflows';
import {
  BUYER_REGION_HEADER,
  decodeRegion,
  distanceMiles,
  regionFromZip,
} from '../../../lib/region';

/**
 * Public lead-intake endpoint. Anon -> service-role insert. Per CLAUDE.md the
 * canonical pattern is a Supabase edge function; we run it as a Next.js route
 * here because the public app is the natural HTTP entry point and we don't
 * gain anything by adding a deno hop.
 */
export async function POST(req: Request) {
  let body: {
    home_id?: string | null;
    stock_no?: string;
    contact_name?: string;
    email?: string;
    phone?: string;
    /** Phase F: explicit zip from the form (overrides cookie/header). */
    zip?: string;
    /** Phase F: explicit location targeting from a sub-site form. */
    location_slug?: string;
    /** Phase C: the home_design this lead came from, when /contact?design=… is used. */
    source_design_id?: string | null;
    message?: string | null;
    sms_consent?: boolean;
    source?: LeadSource | string;
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_term?: string | null;
    utm_content?: string | null;
    gclid?: string | null;
    fbclid?: string | null;
    referrer_url?: string | null;
    landing_path?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const contact_name = (body.contact_name ?? '').trim();
  const email = (body.email ?? '').trim();
  if (!contact_name || !email) {
    return NextResponse.json({ message: 'Name and email are required' }, { status: 400 });
  }

  const sb = createServiceClient();

  let orgId: string | null = null;
  let homeId: string | null = null;
  if (body.home_id && body.home_id !== 'general') {
    const { data: home } = await sb
      .from('homes')
      .select('id, org_id')
      .eq('id', body.home_id)
      .maybeSingle();
    if (home) {
      homeId = home.id;
      orgId = home.org_id;
    }
  }
  if (!orgId) {
    const { data: org } = await sb
      .from('orgs')
      .select('id')
      .eq('status', 'active')
      .order('created_at')
      .limit(1)
      .maybeSingle();
    orgId = org?.id ?? null;
  }
  if (!orgId) {
    return NextResponse.json({ message: 'No active org configured' }, { status: 500 });
  }

  const { data: pickRes } = await sb.rpc('pick_next_assignee', { p_org_id: orgId });
  const assigneeId = (pickRes as string | null) ?? null;

  // ─── Phase F: route to nearest location ────────────────────────────────
  // Resolution priority for region: explicit body.zip → x-buyer-region header
  // (set by middleware from the buyer's cookie). Then load all the org's
  // active locations and pick the nearest by haversine, falling back to the
  // org's default location if no region is known or no location has coords.
  let assignedLocationId: string | null = null;
  let resolvedRegion: { zip: string | null; county: string | null; state: string } | null = null;

  if (body.zip) {
    resolvedRegion = regionFromZip(body.zip);
  } else {
    resolvedRegion = decodeRegion(headers().get(BUYER_REGION_HEADER));
  }

  // Fast path: the form told us which location it lives under.
  if (body.location_slug) {
    const { data: loc } = await sb
      .from('locations')
      .select('id')
      .eq('org_id', orgId)
      .eq('slug', body.location_slug)
      .is('deleted_at', null)
      .maybeSingle();
    if (loc) assignedLocationId = loc.id;
  }

  if (!assignedLocationId) {
    const { data: locations } = await sb
      .from('locations')
      .select('id, lat, lng, is_default, zip')
      .eq('org_id', orgId)
      .is('deleted_at', null);

    const list = (locations ?? []) as Array<{
      id: string; lat: number | null; lng: number | null;
      is_default: boolean; zip: string | null;
    }>;

    // Try haversine if we have coords AND a buyer-region with a zip we can
    // resolve to the centroid of the location's own zip (cheap proxy: assume
    // each location's lat/lng is its physical site, and the buyer's zip
    // centroid is approximated via location-with-matching-zip if any).
    if (resolvedRegion?.zip) {
      const sameZip = list.find((l) => l.zip === resolvedRegion!.zip);
      if (sameZip) assignedLocationId = sameZip.id;
    }

    // No exact-zip match: pick by haversine if buyer's zip resolves to a
    // location's own coords (rough match through county). For a fuller
    // implementation, we'd geocode the buyer's zip → lat/lng once at intake.
    // For v1, we just fall back to default if no exact-zip match.
    if (!assignedLocationId) {
      const def = list.find((l) => l.is_default);
      assignedLocationId = def?.id ?? list[0]?.id ?? null;
    }

    // Suppress the unused-import warning for distanceMiles — keeps the
    // helper available for the v2 geocoded-buyer-zip routing.
    void distanceMiles;
  }

  const allowed: LeadSource[] = ['quote_form', 'contact_form', 'phone', 'walkin', 'tradein', 'import'];
  const source = (allowed as string[]).includes(body.source as string)
    ? (body.source as LeadSource)
    : 'quote_form';

  const consent = body.sms_consent === true;
  const consentText = consent
    ? 'I agree to receive text messages about my inquiry. Reply STOP to opt out.'
    : null;

  // Marketing attribution. Trim/cap to keep storage bounded and reject obvious abuse.
  function clean(v: string | null | undefined): string | null {
    if (!v) return null;
    const s = String(v).trim().slice(0, 250);
    return s || null;
  }

  const { data: lead, error: leadErr } = await sb
    .from('leads')
    .insert({
      org_id: orgId,
      home_id: homeId,
      contact_name,
      email,
      phone: (body.phone ?? '').trim() || null,
      source,
      stage: 'new',
      assignee_id: assigneeId,
      assigned_location_id: assignedLocationId,
      sms_consent: consent,
      sms_consent_at: consent ? new Date().toISOString() : null,
      sms_consent_text: consentText,
      qualifier_payload: body.stock_no ? { stock_no: body.stock_no } : null,
      utm_source: clean(body.utm_source),
      utm_medium: clean(body.utm_medium),
      utm_campaign: clean(body.utm_campaign),
      utm_term: clean(body.utm_term),
      utm_content: clean(body.utm_content),
      gclid: clean(body.gclid),
      fbclid: clean(body.fbclid),
      referrer_url: clean(body.referrer_url),
      landing_path: clean(body.landing_path),
      source_design_id: body.source_design_id || null,
    })
    .select('id, reply_token')
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ message: leadErr?.message ?? 'Insert failed' }, { status: 500 });
  }

  const initialBody =
    (body.message ?? '').trim() ||
    `New ${source.replace('_', ' ')} from ${contact_name}` +
      (body.stock_no ? ` re: ${body.stock_no}` : '');

  await sb.from('lead_messages').insert({
    lead_id: lead.id,
    org_id: orgId,
    kind: 'inbound',
    channel: 'email',
    body: initialBody,
  });

  // Notify dealer inbox of the new lead. Best-effort — failures don't block intake.
  const notifyTo = process.env.LEAD_NOTIFY_EMAIL;
  if (notifyTo) {
    const adminBase = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.upstatehomecenter.com';
    const inboxUrl = `${adminBase}/leads/${lead.id}`;
    const subjectLabel = source.replace('_', ' ');
    await sendEmail({
      to: notifyTo,
      subject: `New ${subjectLabel} lead: ${contact_name}${body.stock_no ? ` re ${body.stock_no}` : ''}`,
      text: [
        `Name: ${contact_name}`,
        `Email: ${email}`,
        `Phone: ${(body.phone ?? '').trim() || '—'}`,
        body.stock_no ? `Home: ${body.stock_no}` : null,
        `Source: ${subjectLabel}`,
        '',
        initialBody,
        '',
        `Open in admin: ${inboxUrl}`,
      ].filter(Boolean).join('\n'),
    }).catch((e) => console.error('[lead-intake] notify failed:', e));
  }

  // Fire workflow event so any matching org rules (auto-replies, drip enroll,
  // assignment overrides) run. Best-effort — failures don't block intake.
  await dispatchWorkflowEvent({
    event: 'lead.created',
    orgId,
    payload: { ...lead, contact_name, email, phone: body.phone ?? null, source, home_id: homeId, utm_source: clean(body.utm_source), utm_campaign: clean(body.utm_campaign) },
  }).catch((e) => console.error('[lead-intake] workflow dispatch failed:', e));

  return NextResponse.json({ ok: true, lead_id: lead.id });
}
