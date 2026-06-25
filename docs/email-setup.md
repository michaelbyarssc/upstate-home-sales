# Email setup — Resend: outbound on `mail.`, inbound replies on `replies.upstatehomecenter.com`

How customer email works for **Upstate Home Center** (legal entity: Upstate Home
Sales LLC). Everything below was verified on **2026-06-10** against the Resend
API (`GET https://api.resend.com/domains`) and live DNS — if you suspect this
doc has drifted again, re-check those two sources before trusting it.

## Current state at a glance

| Piece                                  | Value                                                          | Status |
|----------------------------------------|----------------------------------------------------------------|--------|
| Outbound provider                      | Resend                                                         | ✅ working |
| Verified sending domain                | `mail.upstatehomecenter.com`                                   | ✅ `verified` in Resend |
| From address (`RESEND_FROM_EMAIL`)     | `hello@mail.upstatehomecenter.com`                             | ✅ |
| Reply domain (`EMAIL_INBOUND_DOMAIN`)  | `replies.upstatehomecenter.com`                                | ✅ **LIVE — E2E-verified 2026-06-24** (real reply → lead timeline). MX `verified`; webhook + secret live. ⚠ Resend domain reads `failed` but receiving works anyway — only the MX matters (§ Inbound replies) |
| Dealer mailbox (apex MX)               | Google Workspace (`aspmx.l.google.com`)                        | managed outside this repo |
| DNS, both domains                      | **GoDaddy nameservers** (`*.domaincontrol.com`) — edit records in the GoDaddy DNS dashboard | |
| Legacy `mail.upstatehomesales.com`     | status **`failed`** in Resend                                  | ❌ dead — do not use |

Env values live in **Vercel project settings** (projects **uhs-public** and
**uhs-admin**, production *and* preview) and locally in **`.env.local` at the
repo root** — `apps/public/.env.local` and `apps/admin/.env.local` are symlinks
to it.

> ## ⚠ DO NOT BUILD WITH SENDGRID
>
> SendGrid was the original choice in `handoff.html`, but was **retired** in
> commit `81af731` in favor of Resend. **Do not** reintroduce
> `SENDGRID_API_KEY`, install `@sendgrid/*` packages, add SendGrid Inbound
> Parse webhooks, or add SendGrid CNAMEs/DKIM records (`url1136`, `106931890`,
> `em9029`, `s1._domainkey`, `s2._domainkey`). If a future session is asked to
> "set up SendGrid", point at this notice and confirm with the operator first —
> they may not realize the migration happened. The same applies to re-pointing
> email env at any `upstatehomesales.com` address: that domain's Resend
> verification is dead.

## Environment variables

| Var                      | Value / notes |
|--------------------------|---------------|
| `RESEND_API_KEY`         | From <https://resend.com/api-keys>. Set in both Vercel projects + `.env.local`. |
| `RESEND_FROM_EMAIL`      | `hello@mail.upstatehomecenter.com`. **Must** be an address on the verified `mail.` subdomain — never the bare apex, never an `upstatehomesales.com` address. |
| `LEAD_NOTIFY_EMAIL`      | Dealer inbox that receives new-lead alerts. Set in Vercel production; empty locally is fine (sends are skipped). |
| `EMAIL_INBOUND_DOMAIN`   | `replies.upstatehomecenter.com`. Used to build `Reply-To: replies+{token}@…` headers. Receiving is not wired up — see § Inbound replies. |
| `RESEND_WEBHOOK_SECRET`  | Svix signing secret (`whsec_…`) for the Resend inbound webhook, from <https://resend.com/webhooks>. **uhs-public only** — that app hosts the endpoint. Unset → Resend events are rejected with 503. |
| `INBOUND_WEBHOOK_SECRET` | Bearer secret for the **legacy** Cloudflare Worker transport (dormant). Only needed if that path is ever revived. |

`scripts/vercel-env-resend.sh` pushes these to both Vercel projects
(production + preview) in one go, then reminds you to redeploy.

## ⚠ After changing email env — verify sends

`sendEmail` in `apps/*/lib/notify.ts` returns `ok: false` on failure instead of
throwing, so a wrong env value fails **silently** — the app keeps working and
email just quietly stops.

> **Incident, 2026-06-09:** uhs-public production `RESEND_FROM_EMAIL` pointed
> at the unverified apex `upstatehomecenter.com`. Resend returned 403 on every
> send from the live site for **~34 days** — dealer new-lead alerts were dead
> the entire time and nothing surfaced it (send results weren't logged until
> commit `90e0e7d`). Fix was `vercel env add RESEND_FROM_EMAIL production
> --force` with the correct `hello@mail.upstatehomecenter.com` + a redeploy.

Checklist — run it every time you touch email env:

1. Set the var with force-overwrite in **each** project that sends email
   (both do — public sends lead alerts + customer confirmations, admin sends
   replies/quotes/invoices):
   ```bash
   cd apps/public    # then repeat in apps/admin
   vercel env add RESEND_FROM_EMAIL production --force
   # paste: hello@mail.upstatehomecenter.com
   ```
2. **Redeploy** — env edits do nothing until the next deployment:
   ```bash
   vercel redeploy <current-prod-deployment-url>
   ```
3. Trigger a real send: submit a quote/contact form on the live site (public),
   or send a quote from the admin.
4. Confirm in **Resend dashboard → Emails** that the send shows `delivered`,
   and that it actually landed in the recipient inbox.
5. Tail production logs and grep for send failures:
   ```bash
   vercel logs https://upstatehomecenter.com   # long-running; background it (macOS has no `timeout`)
   # look for "[lead-intake] … not sent:" lines
   ```

## Outbound — how it's wired

```
app (apps/public or apps/admin)
  └── lib/notify.ts ──Resend API──> Resend ──SMTP──> recipient inbox
                                      │
                                      │ verified domain: mail.upstatehomecenter.com
                                      │ From: hello@mail.upstatehomecenter.com
                                      │ Reply-To: replies+{token}@replies.upstatehomecenter.com
                                      │           (⚠ currently bounces — see § Inbound replies)
```

Resend's DNS records for the verified domain (all status `verified`, living in
the **GoDaddy** zone for `upstatehomecenter.com`):

| Type       | Name (relative to apex)       | Value |
|------------|-------------------------------|-------|
| TXT (DKIM) | `resend._domainkey.mail`      | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQD03AKL…` (key is account-specific) |
| MX         | `send.mail`                   | `feedback-smtp.us-east-1.amazonses.com`, priority 10 |
| TXT (SPF)  | `send.mail`                   | `v=spf1 include:amazonses.com ~all` |

To re-create from scratch: Resend → **Domains** → **Add Domain** →
`mail.upstatehomecenter.com` → add the records Resend shows (they're
account-specific) in the GoDaddy DNS dashboard → **Verify**.

## Inbound replies — Resend Inbound (LIVE; E2E-verified 2026-06-24)

The two-way email design: outbound mail carries
`Reply-To: replies+{token}@replies.upstatehomecenter.com`; Resend receives the
reply and POSTs an `email.received` webhook to
`https://upstatehomecenter.com/api/webhooks/inbound-email`, which matches
`{token}` against `leads.reply_token` and writes a `lead_messages` row that
appears in the admin lead timeline via realtime.

**Implemented in the app:** the webhook route
(`apps/public/app/api/webhooks/inbound-email/route.ts`) natively accepts
Resend Inbound events — it verifies the Svix-style signature
(`svix-id`/`svix-timestamp`/`svix-signature` headers against
`RESEND_WEBHOOK_SECRET`, 5-minute timestamp tolerance), handles
`email.received`, fetches the message body from
`GET https://api.resend.com/emails/receiving/{email_id}` (events carry
metadata only, no body), dedupes retries on `email_id`, and returns non-2xx on
transient failures so Resend re-delivers. Pure helpers (signature verify,
HTML→text fallback) live in `apps/public/lib/inbound-email.ts`. The legacy
Worker bearer transport still works in parallel (see fallback note below).

**Status: LIVE — end-to-end verified 2026-06-24.** A real reply to
`replies+{token}@replies.upstatehomecenter.com` was received and written to the
matching lead's timeline as an `inbound`/`email` `lead_messages` row. Config was
done 2026-06-23; it started actually flowing 2026-06-24 once AWS SES finished
provisioning the receipt rule (see the "took hours" note below). Live config
(for reference / disaster recovery):

- Resend receiving domain id `cd6d584b-ae9e-4b61-806c-612bc1627ae8`
  (`replies.upstatehomecenter.com`, us-east-1). Enable receiving via API:
  `PATCH /domains/{id}` body `{"capabilities":{"receiving":"enabled"}}`.
- GoDaddy MX: host `replies` → `inbound-smtp.us-east-1.amazonaws.com` prio 10
  (verified at authoritative NS + Resend). GoDaddy has no API creds in this
  repo — the record was added through the GoDaddy DNS dashboard.
- Resend webhook id `8c977877-f4a6-4854-9d8d-5fcba202f9c9` →
  `https://upstatehomecenter.com/api/webhooks/inbound-email`, event
  `email.received`. ⚠ Resend webhooks are **account-wide**; this shared account
  also has an `email.received` webhook for another product, so both endpoints
  receive every inbound event (handlers ignore non-matching tokens). The
  signing secret is re-readable via `GET /webhooks/{id}`.
- ⚠ **The Resend domain reads `status: failed` (and DKIM `failed`) — IGNORE IT.**
  Receiving needs only the **verified MX**, not full domain verification. A DKIM
  TXT (`resend._domainkey.replies`) was added and is byte-for-byte correct +
  resolves on Google/Cloudflare/Quad9, yet Resend won't mark it verified — a
  Resend-side quirk that's cosmetic for a receive-only domain. Do **not** chase
  the `failed` status; inbound works (proven by the E2E above).
- **The activation delay was AWS SES, not DNS.** For ~hours after the MX went in,
  test sends to `replies+…@` **bounced instantly** (hard SMTP reject) because the
  SES receipt rule hadn't provisioned. Resend's dashboard said *"Looking for DNS
  records: may take a few hours."* Once provisioned, sends return `delivered`.
  `POST /domains/{id}/verify` does not speed this up — just wait.

### Activation checklist (operator, ~15 min + DNS propagation) — ✅ completed 2026-06-23

1. **Resend — add the receiving domain.** <https://resend.com/domains> →
   **Add Domain** → `replies.upstatehomecenter.com`, region **us-east-1**
   (must match the sending domain's region). Enable **Receiving** on the
   domain page — a modal then shows the exact **MX record** to add. Only the
   MX matters for inbound; if the dashboard also lists sending records
   (SPF/DKIM on `send.replies…`/`resend._domainkey.replies…`), adding them is
   harmless but not required for receiving.
2. **GoDaddy — add the MX.** <https://dcc.godaddy.com> →
   `upstatehomecenter.com` → **DNS** → add record: type **MX**, name
   **`replies`**, value + priority **exactly as the Resend modal shows**
   (us-east-1 accounts get SES inbound, e.g.
   `inbound-smtp.us-east-1.amazonaws.com` priority 10 — but copy from the
   modal, not from this doc). The `replies` host currently has zero records,
   so nothing conflicts. After propagation, verify:
   ```bash
   dig MX replies.upstatehomecenter.com +short
   ```
3. **Resend — create the webhook.** <https://resend.com/webhooks> → **Add
   Webhook** → endpoint
   `https://upstatehomecenter.com/api/webhooks/inbound-email`, subscribe to
   **`email.received`** only. Copy the signing secret (`whsec_…`).
4. **Vercel — set the secret + redeploy.** Add
   `RESEND_WEBHOOK_SECRET=whsec_…` to **uhs-public** (production + preview) —
   `scripts/vercel-env-resend.sh` prompts for it — then **redeploy uhs-public**
   (env edits do nothing until the next deployment).
5. **Smoke-test the live endpoint** (no DB writes — uses a made-up reply
   token; proves signature verification, parsing, and the lead lookup):
   ```bash
   node scripts/test-inbound-webhook.mjs \
     https://upstatehomecenter.com/api/webhooks/inbound-email 'whsec_…'
   ```
   Expect all four checks to PASS.
6. **End-to-end test:** admin → open a lead → reply via the email tab → send;
   answer that email from your own inbox; the reply should appear in the lead
   timeline within seconds. If it doesn't:
   - Resend dashboard → **Emails → Received**: did the inbound mail arrive at
     all? (No → DNS/MX problem, re-check step 2.)
   - Resend dashboard → **Webhooks → your endpoint → deliveries**: delivery
     status, response codes, retries. (401 → secret mismatch, re-do step 4.)
   - `vercel logs` on uhs-public, grep `[inbound-email]` — `ignored: no token`
     means the Reply-To header was lost; `ignored: no lead` means the token
     doesn't match any `leads.reply_token`.

### Fallback option (not chosen)

Moving DNS back to Cloudflare to restore Email Routing → Worker → webhook (the
§ History design) would also work, but it moves nameservers for the **live web
domain** — riskier than adding one MX record. The Worker
(`workers/inbound-email-router/`) and its `INBOUND_WEBHOOK_SECRET` bearer path
are kept dormant so that contingency stays a DNS-only change, no app deploy
needed.

## Known DNS quirks (cleanup candidates, GoDaddy dashboard)

Verified by `dig` on 2026-06-10. Outbound deliverability currently rides on
DKIM alignment, so these aren't breaking sends today, but they're wrong:

- **Two SPF TXT records** on the apex (`include:amazonses.com` +
  GoDaddy-forwarding `_spfm` include) **and** on `send.mail`. Multiple SPF
  records at one name = SPF permerror.
- **Two DMARC records** at `_dmarc.upstatehomecenter.com` (a GoDaddy default
  pointing at `onsecureserver.net` + a `postmaster@` one). Receivers ignore
  DMARC entirely when more than one record exists.
- `mail.upstatehomecenter.com` has an MX to `inbound-smtp.us-east-1.amazonaws.com`
  even though Resend receiving is disabled — mail to `hello@mail.…` vanishes.

## History

- **SendGrid era** — original `handoff.html` plan; retired in commit `81af731`.
- **Resend + Cloudflare era (on `upstatehomesales.com`)** — outbound on
  `mail.upstatehomesales.com`, inbound via Cloudflare Email Routing →
  `replies.upstatehomesales.com` → Worker, with DNS hosted on Cloudflare.
- **Brand/domain cutover (2026-05)** — the public brand became Upstate Home
  Center. Web moved to `upstatehomecenter.com`, and email followed on
  2026-05-14/15: `mail.upstatehomecenter.com` was verified in Resend and env
  defaults flipped in commit `6a8cddd`. DNS for both domains ended up back on
  GoDaddy nameservers, which silently killed the Cloudflare Email Routing
  inbound path (never re-wired — see § Inbound replies).
  `mail.upstatehomesales.com` now shows `failed` in Resend.
- **Resend Inbound re-wire (2026-06-10)** — the webhook gained native Resend
  `email.received` support (Svix signature verification, body fetch via the
  Received Emails API, retry dedupe). The Cloudflare Worker path stays dormant
  as a fallback. Receiving goes live once the § Inbound replies activation
  checklist is completed.
- **Inbound activated (2026-06-23) + verified live (2026-06-24)** — PR #50 merged
  to `main`; the § Inbound replies checklist was completed: Resend receiving
  domain created (`receiving: enabled`, sending disabled), GoDaddy
  MX `replies → inbound-smtp.us-east-1.amazonaws.com` `verified`, Resend
  `email.received` webhook registered, `RESEND_WEBHOOK_SECRET` set on uhs-public
  (prod+preview) + redeploy, smoke test 4/4. Mail bounced for ~hours afterward
  (AWS SES receipt-rule provisioning), then began flowing on 2026-06-24; a
  real-reply E2E confirmed an `inbound` `lead_messages` row. Note: the Resend
  domain still shows `failed` (DKIM) but receiving works on the verified MX alone.
- All DNS helper scripts from earlier eras — `scripts/cloudflare-dns-apply.sh`,
  `scripts/cloudflare-dns-apply-newdomain.sh`, `scripts/godaddy-dns-apply.sh` —
  are **deprecated** and exit 1; they're kept for git history only.

## Reference

- Resend domains: <https://resend.com/domains> · API check:
  `curl -s -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/domains`
- Resend receiving docs: <https://resend.com/docs/dashboard/receiving/introduction>
- Outbound notify helpers: `apps/admin/lib/notify.ts`, `apps/public/lib/notify.ts`
- Inbound webhook handler: `apps/public/app/api/webhooks/inbound-email/route.ts`
- Inbound helpers (Svix verify, HTML→text): `apps/public/lib/inbound-email.ts`
- Inbound smoke test: `scripts/test-inbound-webhook.mjs`
- Inbound Worker source (dormant fallback): `workers/inbound-email-router/src/index.ts`
- Env push helper: `scripts/vercel-env-resend.sh`
