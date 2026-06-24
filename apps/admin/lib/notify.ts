/**
 * Outbound notification dispatch — Resend (email) + Twilio (SMS).
 * Used by lead-message server actions when kind=outbound.
 *
 * If credentials are missing the helpers no-op and return { ok: true, skipped: true }
 * so local development without the API keys still saves messages to the timeline.
 */

type Result = { ok: boolean; skipped?: boolean; error?: string };

export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
  html?: string; // optional HTML alternative — needed for clickable links outside Gmail
  replyToToken: string; // becomes Reply-To: replies+{token}@EMAIL_INBOUND_DOMAIN
  fromName?: string;
}): Promise<Result> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.RESEND_FROM_EMAIL;
  const inboundDomain = process.env.EMAIL_INBOUND_DOMAIN;
  if (!apiKey || !fromAddr || !inboundDomain) {
    console.log('[notify.sendEmail] Resend not configured — skipping', { to: args.to });
    return { ok: true, skipped: true };
  }

  const replyTo = `replies+${args.replyToToken}@${inboundDomain}`;
  const fromName = args.fromName ?? 'Upstate Home Center';
  const body: Record<string, unknown> = {
    from: `${fromName} <${fromAddr}>`,
    to: [args.to],
    reply_to: replyTo,
    subject: args.subject,
    text: args.text,
  };
  if (args.html) body.html = args.html;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `Resend ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

export async function sendSms(args: { to: string; body: string }): Promise<Result> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !auth || !from) {
    console.log('[notify.sendSms] Twilio not configured — skipping', { to: args.to });
    return { ok: true, skipped: true };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams({ To: args.to, From: from, Body: args.body });
  const basic = Buffer.from(`${sid}:${auth}`).toString('base64');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `Twilio ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}
