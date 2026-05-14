/**
 * Outbound notification dispatch for the public app — Resend (email) only.
 * Mirror of apps/admin/lib/notify.ts; kept duplicated to avoid a shared
 * package for two functions. Update both if the shape changes.
 */

type Result = { ok: boolean; skipped?: boolean; error?: string };

export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
  replyToToken?: string;
  fromName?: string;
}): Promise<Result> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.RESEND_FROM_EMAIL;
  const inboundDomain = process.env.EMAIL_INBOUND_DOMAIN;
  if (!apiKey || !fromAddr) {
    console.log('[notify.sendEmail] Resend not configured — skipping', { to: args.to });
    return { ok: true, skipped: true };
  }

  const fromName = args.fromName ?? 'Upstate Home Center';
  const body: Record<string, unknown> = {
    from: `${fromName} <${fromAddr}>`,
    to: [args.to],
    subject: args.subject,
    text: args.text,
  };
  if (args.replyToToken && inboundDomain) {
    body.reply_to = `replies+${args.replyToToken}@${inboundDomain}`;
  }

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
