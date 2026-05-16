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

  console.log('[inbound-sms] received', { fromNumber, messageSid, bodyLen: body.length });

  if (!fromNumber || !body) {
    return new NextResponse('<Response/>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  const sb = createServiceClient();

  // Normalize phone numbers to digits-only so we match regardless of how the
  // lead's phone was stored ('+18647546364', '8647546364', '(864) 754-6364',
  // '864-754-6364', etc.). Twilio sends the From in E.164 (+18647546364).
  const fromDigits = fromNumber.replace(/\D/g, '');
  const last10 = fromDigits.slice(-10);
  const matchesPhone = (phone: string | null) => {
    if (!phone) return false;
    const d = phone.replace(/\D/g, '');
    return d === fromDigits || d.slice(-10) === last10;
  };

  // STOP / HELP keywords (TCPA compliance) — also normalized.
  const upper = body.toUpperCase();
  if (upper === 'STOP' || upper === 'STOPALL' || upper === 'UNSUBSCRIBE' || upper === 'CANCEL') {
    const { data: stopLeads } = await sb
      .from('leads')
      .select('id, phone')
      .not('phone', 'is', null);
    const stopIds = (stopLeads ?? []).filter((l) => matchesPhone(l.phone)).map((l) => l.id);
    if (stopIds.length > 0) {
      await sb.from('leads').update({ sms_consent: false }).in('id', stopIds);
    }
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have been unsubscribed. Reply START to resume.</Message></Response>`,
      { headers: { 'Content-Type': 'text/xml' } },
    );
  }
  if (upper === 'START' || upper === 'YES' || upper === 'UNSTOP') {
    const { data: startLeads } = await sb
      .from('leads')
      .select('id, phone')
      .not('phone', 'is', null);
    const startIds = (startLeads ?? []).filter((l) => matchesPhone(l.phone)).map((l) => l.id);
    if (startIds.length > 0) {
      await sb
        .from('leads')
        .update({
          sms_consent: true,
          sms_consent_at: new Date().toISOString(),
          sms_consent_method: 'email_link', // closest existing method enum value for "buyer-initiated"
        })
        .in('id', startIds);
    }
  }
  if (upper === 'HELP') {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Upstate Home Center: call (864) 680-4030 for help. Reply STOP to opt out.</Message></Response>`,
      { headers: { 'Content-Type': 'text/xml' } },
    );
  }

  // Find the most recent matching lead by normalized phone.
  const { data: candidates } = await sb
    .from('leads')
    .select('id, org_id, stage, phone, created_at')
    .not('phone', 'is', null)
    .order('created_at', { ascending: false })
    .limit(2000);

  const lead = (candidates ?? []).find((l) => matchesPhone(l.phone));

  if (!lead) {
    console.warn('[inbound-sms] No lead matching phone', { fromNumber, fromDigits, candidatesChecked: candidates?.length ?? 0 });
    return new NextResponse('<Response/>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  console.log('[inbound-sms] matched lead', { leadId: lead.id, storedPhone: lead.phone });

  const { error: insertErr } = await sb.from('lead_messages').insert({
    lead_id: lead.id,
    org_id: lead.org_id,
    kind: 'inbound',
    channel: 'sms',
    body,
    external_id: messageSid || null,
  });
  if (insertErr) {
    console.error('[inbound-sms] lead_messages insert failed', insertErr);
  }

  if (lead.stage === 'lost' || lead.stage === 'won') {
    await sb.from('leads').update({ stage: 'in_progress' }).eq('id', lead.id);
  }

  return new NextResponse('<Response/>', {
    headers: { 'Content-Type': 'text/xml' },
  });
}
