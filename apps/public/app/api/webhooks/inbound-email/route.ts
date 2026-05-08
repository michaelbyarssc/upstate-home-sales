import { NextResponse } from 'next/server';
import { createServiceClient } from '@uhs/db/service';

/**
 * Inbound email webhook — wired for Cloudflare Email Routing → Worker.
 *
 * Resend has no native inbound parse, so:
 *   1. Cloudflare Email Routing accepts mail at our MX records
 *      (replies.upstatehomesales.com).
 *   2. A Worker (workers/inbound-email-router/) parses the raw RFC822 message
 *      and POSTs JSON to this endpoint.
 *
 * Auth: the Worker sends a shared secret in `Authorization: Bearer …`,
 * configured via INBOUND_WEBHOOK_SECRET (set on both the Worker and this app).
 *
 * Routing: outbound Reply-To uses `replies+{token}@<EMAIL_INBOUND_DOMAIN>`,
 * so we extract the token from the recipient and look up the matching lead.
 *
 * Payload shape posted by our Worker:
 *   {
 *     to:        "replies+abc123@replies.upstatehomesales.com",
 *     from:      "Customer <c@example.com>",
 *     subject:   "...",
 *     text:      "...",
 *     messageId: "<...>"
 *   }
 *
 * For ease of swapping providers later, the route also accepts
 * multipart/form-data with the same field names.
 */
export async function POST(req: Request) {
  // ── Auth ───────────────────────────────────────────────────────────────
  const expectedSecret = process.env.INBOUND_WEBHOOK_SECRET;
  if (expectedSecret) {
    const auth = req.headers.get('authorization') ?? '';
    const presented = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    if (presented !== expectedSecret) {
      console.warn('[inbound-email] auth failed');
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }
  }

  // ── Parse ──────────────────────────────────────────────────────────────
  const ct = req.headers.get('content-type') ?? '';
  let to = '';
  let fromHeader = '';
  let subject = '';
  let text = '';
  let messageId: string | null = null;

  if (ct.includes('application/json')) {
    const json = (await req.json().catch(() => null)) as
      | { to?: string; from?: string; subject?: string; text?: string; messageId?: string }
      | null;
    if (!json) return NextResponse.json({ ok: false, message: 'Bad JSON' }, { status: 400 });
    to = json.to ?? '';
    fromHeader = json.from ?? '';
    subject = json.subject ?? '';
    text = json.text ?? '';
    messageId = json.messageId ?? null;
  } else {
    const fd = await req.formData().catch(() => null);
    if (!fd) return NextResponse.json({ ok: false, message: 'No form data' }, { status: 400 });
    to = String(fd.get('to') ?? '');
    fromHeader = String(fd.get('from') ?? '');
    subject = String(fd.get('subject') ?? '');
    text = String(fd.get('text') ?? '');
    messageId = String(fd.get('Message-ID') ?? '') || null;
  }

  // ── Token extraction ───────────────────────────────────────────────────
  // Token lives in the local-part: replies+TOKEN@domain
  const m = to.match(/replies\+([a-f0-9]+)@/i);
  if (!m) {
    console.warn('[inbound-email] No reply token in to:', to);
    return NextResponse.json({ ok: true, ignored: 'no token' });
  }
  const token = m[1];

  // ── Match lead and record the message ──────────────────────────────────
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
    external_id: messageId,
    attachments: { from: fromHeader, subject, raw_to: to },
  });

  // Bump lead back to in_progress if it was quoted/lost — customer is engaging.
  if (lead.stage === 'lost' || lead.stage === 'won') {
    await sb.from('leads').update({ stage: 'in_progress' }).eq('id', lead.id);
  }

  return NextResponse.json({ ok: true });
}
