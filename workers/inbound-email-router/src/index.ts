/**
 * Cloudflare Worker — inbound email router.
 *
 * Cloudflare Email Routing accepts mail at MX records for
 * replies.upstatehomesales.com and invokes this Worker's `email` handler
 * with a ForwardableEmailMessage. We parse the raw RFC822 headers + body and
 * POST a small JSON payload to the public app's webhook, which writes a
 * lead_messages row.
 *
 * Setup:
 *   wrangler secret put INBOUND_WEBHOOK_SECRET
 *   wrangler secret put PUBLIC_APP_URL          # e.g. https://upstatehomesales.com
 *   wrangler deploy
 *
 * In Cloudflare → Email → Email Routing → Routing Rules:
 *   Catch-all on replies.upstatehomesales.com → "Send to a Worker" → this Worker
 */

interface Env {
  INBOUND_WEBHOOK_SECRET: string;
  PUBLIC_APP_URL: string; // no trailing slash
}

interface ForwardableEmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    // Read raw RFC822 stream into a string.
    const reader = message.raw.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    // Cap at 1 MB; longer mails get truncated. Customer replies in this CRM
    // are short — anyone sending a megabyte of inline HTML is probably a bot.
    const MAX = 1024 * 1024;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
        if (total >= MAX) break;
      }
    }
    const raw = new TextDecoder().decode(concat(chunks));

    const subject = message.headers.get('subject') ?? '';
    const messageId = message.headers.get('message-id') ?? null;
    const text = extractTextBody(raw);

    const res = await fetch(`${env.PUBLIC_APP_URL}/api/webhooks/inbound-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.INBOUND_WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({
        to: message.to,
        from: message.from,
        subject,
        text,
        messageId,
      }),
    });

    if (!res.ok) {
      // Reject the message so Cloudflare bounces it back to sender.
      // Better than silently dropping — sender will know to try again.
      const reason = `Webhook ${res.status}`;
      console.error('[inbound-email-router]', reason, await res.text().catch(() => ''));
      message.setReject(reason);
    }
  },
};

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Naïve RFC822 text/plain extractor. Good enough for typical replies — pulls
 * the first text/plain part out of a multipart message, or the whole body if
 * not multipart. Strips quoted history is left to the receiving app.
 */
function extractTextBody(raw: string): string {
  // Split headers/body on the first blank line.
  const sep = raw.indexOf('\r\n\r\n');
  const altSep = sep === -1 ? raw.indexOf('\n\n') : sep;
  if (altSep === -1) return raw;
  const headerBlock = raw.slice(0, altSep).toLowerCase();
  const body = raw.slice(altSep + (sep === -1 ? 2 : 4));

  const ctMatch = headerBlock.match(/content-type:\s*([^;\r\n]+)(?:;[^\r\n]*boundary="?([^";\r\n]+)"?)?/i);
  const ct = ctMatch?.[1]?.trim() ?? 'text/plain';
  const boundary = ctMatch?.[2];

  if (!boundary || !ct.startsWith('multipart/')) {
    return decodeQuotedPrintableMaybe(body, headerBlock).trim();
  }

  const parts = body.split(`--${boundary}`);
  for (const part of parts) {
    if (!part || part.trim() === '--') continue;
    const partSep = part.indexOf('\r\n\r\n');
    const partAlt = partSep === -1 ? part.indexOf('\n\n') : partSep;
    if (partAlt === -1) continue;
    const partHeaders = part.slice(0, partAlt).toLowerCase();
    if (partHeaders.includes('content-type: text/plain')) {
      const partBody = part.slice(partAlt + (partSep === -1 ? 2 : 4));
      return decodeQuotedPrintableMaybe(partBody, partHeaders).trim();
    }
  }
  return body.trim();
}

function decodeQuotedPrintableMaybe(body: string, headers: string): string {
  if (!/content-transfer-encoding:\s*quoted-printable/.test(headers)) return body;
  return body
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
