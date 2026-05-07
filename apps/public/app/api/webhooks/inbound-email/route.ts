import { NextResponse } from 'next/server';
import { createServiceClient } from '@uhs/db/service';

/**
 * SendGrid Inbound Parse webhook.
 * Configured in the SendGrid dashboard to forward
 * `replies.upstatehomesales.com` to this endpoint as multipart/form-data.
 *
 * Routing: SendGrid puts the inbound recipient in the `to` field. Our outbound
 * Reply-To uses `replies+{token}@replies.upstatehomesales.com`, so we extract
 * the token and look up the matching lead.
 */
export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ ok: false, message: 'No form data' }, { status: 400 });

  const to = String(fd.get('to') ?? '');
  const fromHeader = String(fd.get('from') ?? '');
  const subject = String(fd.get('subject') ?? '');
  const text = String(fd.get('text') ?? '');

  // Token lives in the local-part: replies+TOKEN@domain
  const m = to.match(/replies\+([a-f0-9]+)@/i);
  if (!m) {
    console.warn('[inbound-email] No reply token in to:', to);
    return NextResponse.json({ ok: true, ignored: 'no token' });
  }
  const token = m[1];

  const sb = createServiceClient();
  const { data: lead } = await sb
    .from('leads')
    .select('id, org_id, stage')
    .eq('reply_token', token)
    .maybeSingle();
  if (!lead) {
    console.warn('[inbound-email] No lead for token', token);
    return NextResponse.json({ ok: true, ignored: 'no lead' });
  }

  await sb.from('lead_messages').insert({
    lead_id: lead.id,
    org_id: lead.org_id,
    kind: 'inbound',
    channel: 'email',
    body: text || subject || '(no body)',
    external_id: String(fd.get('Message-ID') ?? '') || null,
    attachments: { from: fromHeader, subject, raw_to: to },
  });

  // Bump lead back to in_progress if it was quoted/lost — customer is engaging.
  if (lead.stage === 'lost' || lead.stage === 'won') {
    await sb.from('leads').update({ stage: 'in_progress' }).eq('id', lead.id);
  }

  return NextResponse.json({ ok: true });
}
