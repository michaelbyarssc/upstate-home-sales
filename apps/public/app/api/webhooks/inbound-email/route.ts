import { NextResponse } from 'next/server';
import { createServiceClient } from '@uhs/db/service';
import { htmlToText, verifySvixSignature } from '@/lib/inbound-email';

/**
 * Inbound email webhook — turns customer replies into lead_messages rows
 * (which surface in the admin lead timeline via realtime).
 *
 * Two transports are accepted, distinguished per-request:
 *
 * 1. Resend Inbound (current) — Resend receives mail for
 *    EMAIL_INBOUND_DOMAIN and POSTs an `email.received` event here, signed
 *    Svix-style (svix-id / svix-timestamp / svix-signature headers, secret
 *    in RESEND_WEBHOOK_SECRET). The event carries metadata only — no body —
 *    so after the reply token matches a lead we fetch text/html from
 *    GET https://api.resend.com/emails/receiving/{email_id}.
 *    Setup walkthrough: docs/email-setup.md § Inbound replies.
 *
 * 2. Legacy Cloudflare Worker (dormant) — workers/inbound-email-router/
 *    POSTs parsed JSON with `Authorization: Bearer INBOUND_WEBHOOK_SECRET`.
 *    Kept so the Email Routing transport could be revived by DNS alone,
 *    without an app deploy.
 *
 * Routing: outbound mail sets `Reply-To: replies+{token}@EMAIL_INBOUND_DOMAIN`;
 * the token is extracted from the recipient address and matched to
 * leads.reply_token.
 */

const MAX_BODY_CHARS = 100_000;

export async function POST(req: Request) {
  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (svixId && svixTimestamp && svixSignature) {
    return handleResendEvent(req, { svixId, svixTimestamp, svixSignature });
  }
  return handleWorkerPost(req);
}

// ── Transport 1: Resend Inbound ──────────────────────────────────────────

async function handleResendEvent(
  req: Request,
  svix: { svixId: string; svixTimestamp: string; svixSignature: string },
) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[inbound-email] RESEND_WEBHOOK_SECRET not set — rejecting Resend webhook');
    return NextResponse.json({ ok: false, message: 'Not configured' }, { status: 503 });
  }

  const payload = await req.text();
  const verdict = verifySvixSignature({
    secret,
    id: svix.svixId,
    timestamp: svix.svixTimestamp,
    signature: svix.svixSignature,
    payload,
  });
  if (!verdict.ok) {
    console.warn('[inbound-email] Resend signature rejected:', verdict.reason);
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  let event: {
    type?: string;
    data?: {
      email_id?: string;
      from?: string;
      to?: unknown;
      cc?: unknown;
      subject?: string;
      message_id?: string;
      attachments?: Array<{ filename?: string }>;
    };
  };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad JSON' }, { status: 400 });
  }

  if (event?.type !== 'email.received') {
    // The endpoint may get subscribed to more event types later; ack quietly.
    return NextResponse.json({ ok: true, ignored: `event ${event?.type ?? 'unknown'}` });
  }

  const d = event.data ?? {};
  const emailId = typeof d.email_id === 'string' ? d.email_id : null;
  if (!emailId) return NextResponse.json({ ok: true, ignored: 'no email_id' });

  const recipients = [d.to, d.cc].flatMap((v) =>
    Array.isArray(v) ? v.map(String) : typeof v === 'string' ? [v] : [],
  );

  return recordInbound({
    recipients,
    from: String(d.from ?? ''),
    subject: String(d.subject ?? ''),
    externalId: emailId,
    meta: {
      provider: 'resend',
      message_id: d.message_id ?? null,
      attachment_files: (d.attachments ?? []).map((a) => a?.filename).filter(Boolean),
    },
    loadBody: () => fetchReceivedBody(emailId),
  });
}

/**
 * email.received events carry no body — pull text/html from the Received
 * Emails API. Returns '' for a genuinely empty mail, null on failure
 * (→ 500, so Resend retries the event once the API is reachable again).
 */
async function fetchReceivedBody(emailId: string): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[inbound-email] RESEND_API_KEY not set — cannot fetch received email body');
    return null;
  }
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[inbound-email] received-email fetch failed:', res.status, detail);
      return null;
    }
    const email = (await res.json()) as { text?: string | null; html?: string | null };
    const text = (email.text ?? '').trim();
    if (text) return text;
    return email.html ? htmlToText(email.html) : '';
  } catch (e) {
    console.error('[inbound-email] received-email fetch threw:', e instanceof Error ? e.message : e);
    return null;
  }
}

// ── Transport 2: legacy Cloudflare Worker ────────────────────────────────

async function handleWorkerPost(req: Request) {
  const expectedSecret = process.env.INBOUND_WEBHOOK_SECRET;
  if (expectedSecret) {
    const auth = req.headers.get('authorization') ?? '';
    const presented = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    if (presented !== expectedSecret) {
      console.warn('[inbound-email] auth failed');
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }
  }

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

  return recordInbound({
    recipients: [to],
    from: fromHeader,
    subject,
    externalId: messageId,
    meta: {},
    loadBody: async () => text,
  });
}

// ── Shared: token → lead → lead_messages row ─────────────────────────────

async function recordInbound(args: {
  recipients: string[];
  from: string;
  subject: string;
  externalId: string | null;
  meta: Record<string, unknown>;
  /** Lazy so the Resend path only spends an API call once a lead matched. */
  loadBody: () => Promise<string | null>;
}) {
  // Token lives in the local-part: replies+TOKEN@domain
  let token: string | null = null;
  let matchedTo = '';
  for (const addr of args.recipients) {
    const m = addr.match(/replies\+([a-f0-9]+)@/i);
    if (m && m[1]) {
      token = m[1];
      matchedTo = addr;
      break;
    }
  }
  if (!token) {
    console.warn('[inbound-email] No reply token in recipients:', args.recipients.join(', '));
    return NextResponse.json({ ok: true, ignored: 'no token' });
  }

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

  // Webhook deliveries retry — don't write the same message twice.
  if (args.externalId) {
    const { data: dupe } = await sb
      .from('lead_messages')
      .select('id')
      .eq('external_id', args.externalId)
      .limit(1)
      .maybeSingle();
    if (dupe) return NextResponse.json({ ok: true, duplicate: true });
  }

  const body = await args.loadBody();
  if (body === null) {
    return NextResponse.json({ ok: false, message: 'Body fetch failed' }, { status: 500 });
  }

  const { error: insertError } = await sb.from('lead_messages').insert({
    lead_id: lead.id,
    org_id: lead.org_id,
    kind: 'inbound',
    channel: 'email',
    body: (body || args.subject || '(no body)').slice(0, MAX_BODY_CHARS),
    external_id: args.externalId,
    attachments: { from: args.from, subject: args.subject, raw_to: matchedTo, ...args.meta },
  });
  if (insertError) {
    console.error('[inbound-email] lead_messages insert failed:', insertError.message);
    return NextResponse.json({ ok: false, message: 'Insert failed' }, { status: 500 });
  }

  // Bump lead back to in_progress if it was closed out — customer is engaging.
  if (lead.stage === 'lost' || lead.stage === 'won') {
    await sb.from('leads').update({ stage: 'in_progress' }).eq('id', lead.id);
  }

  return NextResponse.json({ ok: true });
}
