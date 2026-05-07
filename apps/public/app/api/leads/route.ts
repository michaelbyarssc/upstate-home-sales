import { NextResponse } from 'next/server';
import { createServiceClient } from '@uhs/db/service';
import type { LeadSource } from '@uhs/db';
import { sendEmail } from '../../../lib/notify';

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
    message?: string | null;
    sms_consent?: boolean;
    source?: LeadSource | string;
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

  const allowed: LeadSource[] = ['quote_form', 'contact_form', 'phone', 'walkin', 'tradein', 'import'];
  const source = (allowed as string[]).includes(body.source as string)
    ? (body.source as LeadSource)
    : 'quote_form';

  const consent = body.sms_consent === true;
  const consentText = consent
    ? 'I agree to receive text messages about my inquiry. Reply STOP to opt out.'
    : null;

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
      sms_consent: consent,
      sms_consent_at: consent ? new Date().toISOString() : null,
      sms_consent_text: consentText,
      qualifier_payload: body.stock_no ? { stock_no: body.stock_no } : null,
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
    const adminBase = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.upstatehomesales.com';
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

  return NextResponse.json({ ok: true, lead_id: lead.id });
}
