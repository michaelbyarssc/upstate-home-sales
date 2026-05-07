import { NextResponse } from 'next/server';
import { createServiceClient } from '@uhs/db/service';

/**
 * Twilio inbound SMS webhook (application/x-www-form-urlencoded).
 * Configured on the Twilio number's "Messaging Configuration".
 *
 * Routing: match the inbound `From` (the customer's number) to the most-recent
 * lead with that phone. Last-write-wins. STOP/HELP keywords are honored —
 * STOP flips sms_consent off so we won't text them again.
 */
export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ ok: false }, { status: 400 });

  const fromNumber = String(fd.get('From') ?? '').trim();
  const body = String(fd.get('Body') ?? '').trim();
  const messageSid = String(fd.get('MessageSid') ?? '');

  if (!fromNumber || !body) {
    return new NextResponse('<Response/>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  const sb = createServiceClient();

  // STOP / HELP keywords (TCPA compliance).
  const upper = body.toUpperCase();
  if (upper === 'STOP' || upper === 'STOPALL' || upper === 'UNSUBSCRIBE' || upper === 'CANCEL') {
    await sb
      .from('leads')
      .update({ sms_consent: false })
      .eq('phone', fromNumber);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have been unsubscribed. Reply START to resume.</Message></Response>`,
      { headers: { 'Content-Type': 'text/xml' } },
    );
  }
  if (upper === 'START' || upper === 'YES' || upper === 'UNSTOP') {
    await sb
      .from('leads')
      .update({ sms_consent: true, sms_consent_at: new Date().toISOString() })
      .eq('phone', fromNumber);
  }
  if (upper === 'HELP') {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Upstate Home Sales: call (803) 555-0124 for help. Reply STOP to opt out.</Message></Response>`,
      { headers: { 'Content-Type': 'text/xml' } },
    );
  }

  // Find the most recent matching lead.
  const { data: lead } = await sb
    .from('leads')
    .select('id, org_id, stage')
    .eq('phone', fromNumber)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lead) {
    console.warn('[inbound-sms] No lead matching phone', fromNumber);
    return new NextResponse('<Response/>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  await sb.from('lead_messages').insert({
    lead_id: lead.id,
    org_id: lead.org_id,
    kind: 'inbound',
    channel: 'sms',
    body,
    external_id: messageSid || null,
  });

  if (lead.stage === 'lost' || lead.stage === 'won') {
    await sb.from('leads').update({ stage: 'in_progress' }).eq('id', lead.id);
  }

  return new NextResponse('<Response/>', {
    headers: { 'Content-Type': 'text/xml' },
  });
}
