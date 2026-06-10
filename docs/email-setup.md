# Email setup — Resend outbound on `mail.upstatehomecenter.com`

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
| Reply domain (`EMAIL_INBOUND_DOMAIN`)  | `replies.upstatehomecenter.com`                                | ⚠ configured but **not receiving** — no MX records (see § Inbound replies) |
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
| `INBOUND_WEBHOOK_SECRET` | Shared secret between the inbound Worker and `/api/webhooks/inbound-email`. Only matters once inbound is re-enabled. |

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

## Inbound replies — NOT currently operational

The two-way email design: outbound mail carries
`Reply-To: replies+{token}@replies.upstatehomecenter.com`; an inbound service
receives the reply and POSTs it to
`apps/public/app/api/webhooks/inbound-email/route.ts` (authed by
`INBOUND_WEBHOOK_SECRET`), which writes a `lead_messages` row that appears in
the admin lead timeline via realtime.

**What exists:** the webhook route, the Cloudflare Worker source
(`workers/inbound-email-router/`), and the env vars.

**What's broken:** the original inbound transport was Cloudflare Email Routing,
which requires the zone's DNS to be hosted on Cloudflare. Both domains now
delegate to GoDaddy nameservers, so Email Routing is inactive and
`replies.upstatehomecenter.com` has **no MX (or any) records**. Customer
replies to `replies+{token}@…` addresses **bounce**. Mail sent directly to
`hello@mail.upstatehomecenter.com` is also a dead end (its MX points at SES
inbound, but the Resend domain has `receiving: disabled`).

Until this is re-wired, treat app email as **outbound-only**: the admin "reply
by email" thread can send but never receives the customer's answer.

Options to re-enable (pick one, then update this doc):

- **Resend Inbound** — enable receiving on a Resend domain and point its
  webhook at `/api/webhooks/inbound-email`. Keeps everything in one vendor; no
  DNS-host move; the Cloudflare Worker becomes unnecessary.
- **Move DNS back to Cloudflare** and re-enable Email Routing → Worker → webhook
  (the original design, see § History). Touches nameservers for the live web
  domain, so coordinate carefully.

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
- All DNS helper scripts from earlier eras — `scripts/cloudflare-dns-apply.sh`,
  `scripts/cloudflare-dns-apply-newdomain.sh`, `scripts/godaddy-dns-apply.sh` —
  are **deprecated** and exit 1; they're kept for git history only.

## Reference

- Resend domains: <https://resend.com/domains> · API check:
  `curl -s -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/domains`
- Outbound notify helpers: `apps/admin/lib/notify.ts`, `apps/public/lib/notify.ts`
- Inbound webhook handler: `apps/public/app/api/webhooks/inbound-email/route.ts`
- Inbound Worker source (dormant): `workers/inbound-email-router/src/index.ts`
- Env push helper: `scripts/vercel-env-resend.sh`
