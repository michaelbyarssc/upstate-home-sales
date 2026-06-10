#!/usr/bin/env node
/**
 * Smoke-test the inbound email webhook with synthetic Svix-signed
 * `email.received` events — proves signature verification, payload parsing,
 * and the lead lookup without writing any rows (the reply token is made up,
 * so the route answers `ignored: "no lead"`).
 *
 *   node scripts/test-inbound-webhook.mjs <endpoint-url> <whsec_secret>
 *
 *   # local:  node scripts/test-inbound-webhook.mjs http://localhost:3000/api/webhooks/inbound-email whsec_...
 *   # prod:   node scripts/test-inbound-webhook.mjs https://upstatehomecenter.com/api/webhooks/inbound-email whsec_...
 *
 * The secret must match RESEND_WEBHOOK_SECRET on the target deployment.
 * Full end-to-end (body fetch + lead_messages insert) still needs a real
 * reply to a real lead — see docs/email-setup.md § Inbound replies.
 */
import crypto from 'node:crypto';

const [url, secret] = process.argv.slice(2);
if (!url || !secret) {
  console.error('usage: node scripts/test-inbound-webhook.mjs <endpoint-url> <whsec_secret>');
  process.exit(1);
}

const domain = process.env.EMAIL_INBOUND_DOMAIN ?? 'replies.upstatehomecenter.com';

function eventBody(type = 'email.received') {
  return JSON.stringify({
    type,
    created_at: new Date().toISOString(),
    data: {
      email_id: `smoke-${crypto.randomUUID()}`,
      from: 'Smoke Test <smoke@example.com>',
      to: [`replies+deadbeefdeadbeefdeadbeefdeadbeef@${domain}`],
      cc: [],
      bcc: [],
      message_id: `<smoke-${Date.now()}@example.com>`,
      subject: 'Inbound webhook smoke test',
      attachments: [],
    },
  });
}

function sign(body, { timestamp = Math.floor(Date.now() / 1000), tamper = false } = {}) {
  const id = `msg_${crypto.randomUUID()}`;
  const ts = String(timestamp);
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  let sig = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  if (tamper) sig = sig.slice(0, -2) + (sig.endsWith('AA') ? 'BB' : 'AA');
  return { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` };
}

async function post(body, headers) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
  return { status: res.status, text: await res.text() };
}

let failures = 0;
async function check(name, fn, expect) {
  const got = await fn();
  const pass = expect(got);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  → ${got.status} ${got.text}`);
  if (!pass) failures++;
}

await check(
  'valid signature, unknown token',
  () => {
    const body = eventBody();
    return post(body, sign(body));
  },
  (r) => r.status === 200 && r.text.includes('no lead'),
);

await check(
  'tampered signature rejected',
  () => {
    const body = eventBody();
    return post(body, sign(body, { tamper: true }));
  },
  (r) => r.status === 401,
);

await check(
  'stale timestamp rejected',
  () => {
    const body = eventBody();
    return post(body, sign(body, { timestamp: Math.floor(Date.now() / 1000) - 3600 }));
  },
  (r) => r.status === 401,
);

await check(
  'non-received event acked + ignored',
  () => {
    const body = eventBody('email.delivered');
    return post(body, sign(body));
  },
  (r) => r.status === 200 && r.text.includes('ignored'),
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
