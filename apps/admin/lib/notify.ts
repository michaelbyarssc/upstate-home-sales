/**
 * Outbound notification dispatch — SendGrid (email) + Twilio (SMS).
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
  replyToToken: string; // becomes Reply-To: replies+{token}@SENDGRID_INBOUND_DOMAIN
  fromName?: string;
}): Promise<Result> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const domain = process.env.SENDGRID_INBOUND_DOMAIN;
  const fromAddr = process.env.SENDGRID_FROM_EMAIL ?? `noreply@${domain ?? 'upstatehomesales.com'}`;
  if (!apiKey || !domain) {
    console.log('[notify.sendEmail] SendGrid not configured — skipping', { to: args.to });
    return { ok: true, skipped: true };
  }

  const replyTo = `replies+${args.replyToToken}@${domain}`;
  const body = {
    personalizations: [{ to: [{ email: args.to }] }],
    from: { email: fromAddr, name: args.fromName ?? 'Upstate Home Sales' },
    reply_to: { email: replyTo },
    subject: args.subject,
    content: [{ type: 'text/plain', value: args.text }],
  };

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `SendGrid ${res.status}: ${text}` };
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
