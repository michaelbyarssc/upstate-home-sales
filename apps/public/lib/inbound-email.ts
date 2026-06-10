import crypto from 'node:crypto';

/**
 * Verify a Svix-signed webhook request. Resend signs all webhooks this way:
 * HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${rawBody}`, keyed with the
 * base64-decoded secret (the part after the `whsec_` prefix). The
 * svix-signature header carries space-delimited `v1,<base64>` candidates —
 * any one matching means the request is authentic.
 * Scheme: https://docs.svix.com/receiving/verifying-payloads/how-manual
 */
export function verifySvixSignature(args: {
  secret: string;
  id: string;
  timestamp: string;
  signature: string;
  /** Raw request body, byte-for-byte as received. */
  payload: string;
  toleranceSec?: number;
  nowSec?: number;
}): { ok: true } | { ok: false; reason: string } {
  const tolerance = args.toleranceSec ?? 300;
  const now = args.nowSec ?? Math.floor(Date.now() / 1000);
  const ts = Number(args.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad timestamp' };
  if (Math.abs(now - ts) > tolerance) return { ok: false, reason: 'timestamp outside tolerance' };

  const key = Buffer.from(args.secret.replace(/^whsec_/, ''), 'base64');
  if (key.length === 0) return { ok: false, reason: 'empty secret' };

  const expected = crypto
    .createHmac('sha256', key)
    .update(`${args.id}.${args.timestamp}.${args.payload}`)
    .digest('base64');
  const expectedBuf = Buffer.from(expected);

  for (const candidate of args.signature.split(' ')) {
    const sep = candidate.indexOf(',');
    if (sep === -1) continue;
    if (candidate.slice(0, sep) !== 'v1') continue;
    const sigBuf = Buffer.from(candidate.slice(sep + 1));
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: 'no matching signature' };
}

/**
 * Crude HTML→text for inbound mails that carry no text/plain part. Good
 * enough for a lead-timeline rendering of a customer reply; not a general
 * HTML parser.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
