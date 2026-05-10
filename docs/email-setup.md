# Email setup — Resend (outbound) + Cloudflare Email Routing (inbound)

End-to-end walkthrough for getting customer email working on `upstatehomesales.com`.
Domain registration stays at GoDaddy; DNS moves to Cloudflare so Email Routing
and Workers are available.

> ## Note on the web/email split
>
> The dealer's **web domain** moved to `upstatehomecenter.com` (also at Cloudflare,
> see `scripts/cloudflare-dns-apply-newdomain.sh`). **Email** still runs on
> `upstatehomesales.com` (this doc) — the Resend sender, Cloudflare Email Routing
> catch-all, and Worker bindings have not been migrated. Re-verifying a sending
> domain in Resend requires new DKIM keys and DNS propagation, so we kept the
> email stack stable while the web cutover happened. When you're ready to migrate
> email too, repeat sections 2 and 3 of this doc against `mail.upstatehomecenter.com`
> and `replies.upstatehomecenter.com`, then update `RESEND_FROM_EMAIL`,
> `EMAIL_INBOUND_DOMAIN`, and the Worker secret `PUBLIC_APP_URL`.

> ## ⚠ DO NOT BUILD WITH SENDGRID
>
> SendGrid was the original choice in `handoff.html`, but was **retired** in
> commit `81af731` in favor of Resend + Cloudflare Email Routing. Reasons:
>
> - Resend is cheaper and has a saner API for transactional email at our scale.
> - Cloudflare Email Routing handles inbound natively — no SendGrid Inbound
>   Parse, no MX/CNAME conflict on `replies.upstatehomesales.com`.
> - Cloudflare DNS unlocks Workers, so the inbound parser can run at the edge
>   instead of inside our Next.js app.
>
> **Do not** reintroduce `SENDGRID_API_KEY`, install `@sendgrid/*` packages, or
> add SendGrid CNAMEs/DKIM records (`url1136`, `106931890`, `em9029`,
> `s1._domainkey`, `s2._domainkey`). If a future session is asked to "set up
> SendGrid", point at this notice and confirm with the operator first — they
> may not realize the migration happened.
>
> Likewise: **do not** push DNS through GoDaddy. Registration is at GoDaddy but
> all records live at Cloudflare. The legacy `scripts/godaddy-dns-apply.sh`
> exits 1 on run and is kept only for git history.

## Architecture

```
Outbound:  app  ──Resend API──>  Resend  ──SMTP──>  customer inbox
                                  ↑
                                  │ verified domain
                                  │ mail.upstatehomesales.com
                                  │
Inbound:   customer  ──SMTP──>  Cloudflare Email Routing
                                  ↓ catch-all → Worker
                                Worker  ──HTTPS POST──>  /api/webhooks/inbound-email
                                                          ↓
                                                        lead_messages row
                                                          ↓ realtime
                                                        admin lead detail UI
```

Two subdomains, two purposes:

| Subdomain                            | Role                       | DNS provider |
|--------------------------------------|----------------------------|--------------|
| `mail.upstatehomesales.com`          | Outbound (Resend)          | Cloudflare   |
| `replies.upstatehomesales.com`       | Inbound (Email Routing)    | Cloudflare   |

Outbound `From:` is `hello@mail.upstatehomesales.com`.
Outbound `Reply-To:` is `replies+{token}@replies.upstatehomesales.com`.

---

## Section 1 · Move DNS from GoDaddy to Cloudflare

1. Sign in at <https://dash.cloudflare.com> (free plan is fine).
2. **Add a Site** → enter `upstatehomesales.com` → free plan.
3. Cloudflare scans existing GoDaddy records and imports them. Review the list
   and remove any stale SendGrid `CNAME`s (`url1136`, `106931890`, `em9029`,
   `s1._domainkey`, `s2._domainkey`).
4. Cloudflare shows two nameservers, e.g.
   - `tara.ns.cloudflare.com`
   - `walt.ns.cloudflare.com`
5. Sign in at <https://dcc.godaddy.com>:
   - Select `upstatehomesales.com` → **DNS** → **Nameservers** → **Change**.
   - Choose **I'll use my own nameservers**.
   - Paste the two Cloudflare nameservers.
   - Save.
6. Propagation usually completes in 1–4 hours. Verify with:
   ```bash
   dig NS upstatehomesales.com +short
   ```
   Expected output: the two Cloudflare hostnames.
7. In Cloudflare → **Overview**, the zone status will flip to **Active**.

---

## Section 2 · Configure Resend (outbound)

1. Sign in at <https://resend.com>. Create an account if needed.
2. **API Keys** → create one. Save it as `RESEND_API_KEY` in `.env.local` and in
   Vercel project env (admin + public, both prod and preview).
3. **Domains** → **Add Domain** → enter `mail.upstatehomesales.com` → **Add**.
4. Resend shows several records to add. There will be:
   - **TXT** SPF on `mail.upstatehomesales.com` — value `v=spf1 include:_spf.resend.com ~all`
   - **MX** on `mail.upstatehomesales.com` → `feedback-smtp.us-east-1.amazonses.com` priority 10
   - **CNAME** DKIM, e.g. `resend._domainkey.mail.upstatehomesales.com → resend.<unique>.dkim.amazonses.com`
   - **TXT** DMARC on `_dmarc.upstatehomesales.com` (Resend will suggest one)

   The DKIM selector + target are **unique to your Resend account** — they
   cannot be hardcoded. Note them down.

5. Apply records via the helper script:
   ```bash
   # Edit scripts/cloudflare-dns-apply.sh first and fill in:
   #   RESEND_DKIM_SELECTOR="resend"
   #   RESEND_DKIM_TARGET="resend.<your-account>.dkim.amazonses.com"

   CF_API_TOKEN=...  CF_ZONE_ID=...  ./scripts/cloudflare-dns-apply.sh
   ```
   The `CF_API_TOKEN` needs `Zone:DNS:Edit` on this zone. Create at
   <https://dash.cloudflare.com/profile/api-tokens>.

6. Back in Resend → **Domains** → **Verify**. Should turn green within a couple
   of minutes once DNS has propagated.

7. Set the env vars:
   ```env
   RESEND_API_KEY=re_xxx
   RESEND_FROM_EMAIL=hello@mail.upstatehomesales.com
   LEAD_NOTIFY_EMAIL=marlena@upstatehomesales.com   # who gets new-lead alerts
   ```

---

## Section 3 · Configure Cloudflare Email Routing (inbound)

> ⚠ Don't add MX records for `replies.upstatehomesales.com` manually.
> Email Routing manages them automatically — adding your own will conflict.

1. Cloudflare dashboard → select your zone → **Email** → **Email Routing**.
2. **Get Started**. Cloudflare adds the required MX + SPF records on the apex.
   Since we want inbound on the `replies` subdomain, do this:
   - **Settings** → **Custom address** is for the apex; we want a subdomain.
   - Click **Routes** → **Catch-all**.
   - Cloudflare requires the zone-level routing to be enabled first; once the
     wizard confirms `upstatehomesales.com` is verified, it lets you add a
     **subdomain destination**. Add `replies.upstatehomesales.com`.
   - If the dashboard does not expose subdomain routing yet, fall back to
     enabling routing on the apex zone and use a wildcard pattern. The Worker
     filters by `replies+TOKEN@…` either way.

   (Cloudflare's UI for subdomain routing has changed several times; see
   <https://developers.cloudflare.com/email-routing/setup/email-routing-addresses/>
   for the current path.)

3. Generate a strong shared secret (used by the Worker → app webhook):
   ```bash
   openssl rand -hex 32
   ```
   Save it.

4. Set it in the public app's env (Vercel + `.env.local`):
   ```env
   EMAIL_INBOUND_DOMAIN=replies.upstatehomesales.com
   INBOUND_WEBHOOK_SECRET=<the openssl output>
   ```

---

## Section 4 · Deploy the Worker

The Worker source lives at `workers/inbound-email-router/`.

```bash
cd workers/inbound-email-router
pnpm install
pnpm exec wrangler login

# Set secrets (these go in the Worker's environment, not the app)
pnpm exec wrangler secret put INBOUND_WEBHOOK_SECRET
# paste the same value you set in the app's env

pnpm exec wrangler secret put PUBLIC_APP_URL
# e.g.  https://upstatehomesales.com   (no trailing slash)

pnpm exec wrangler deploy
```

After deploy:

5. Cloudflare dashboard → **Email** → **Email Routing** → **Routes** → either
   the catch-all rule or the route for `replies+*@replies.upstatehomesales.com`
   → **Action** → **Send to a Worker** → pick `uhs-inbound-email-router`.
6. Save.

---

## Section 5 · End-to-end test

1. From the public site, submit a quote-form lead with your real email.
2. In the admin, open the lead → reply via email tab → send.
3. You should receive the email. The `From:` is `hello@mail.upstatehomesales.com`,
   `Reply-To:` is `replies+abc123@replies.upstatehomesales.com`.
4. Hit reply in your mail client and send.
5. Within a few seconds the lead detail timeline should show your inbound
   message via realtime. Check Worker logs if not:
   ```bash
   cd workers/inbound-email-router && pnpm exec wrangler tail
   ```

If a reply comes in but no row appears:
- 401 in `wrangler tail` → secret mismatch between Worker and app.
- 200 but no row → token missing from the address (verify outbound Reply-To
  header in your mail client's "show original").
- Token present but `ignored: no lead` → token doesn't exist in `leads.reply_token`.

---

## Section 6 · DMARC tightening (after 30 days)

Once you've confirmed legitimate mail isn't getting flagged for ~30 days, raise
DMARC from monitoring to enforcement:

```
v=DMARC1; p=quarantine; rua=mailto:postmaster@upstatehomesales.com
```

…then to `p=reject` after another 30 days. Update via the Cloudflare dashboard
or by re-running `cloudflare-dns-apply.sh` after editing the DMARC line.

---

## Reference

- Resend domain verification: <https://resend.com/docs/dashboard/domains/introduction>
- Cloudflare Email Routing → Workers: <https://developers.cloudflare.com/email-routing/email-workers/>
- Worker source: `workers/inbound-email-router/src/index.ts`
- Inbound webhook handler: `apps/public/app/api/webhooks/inbound-email/route.ts`
- Outbound notify helpers: `apps/admin/lib/notify.ts`, `apps/public/lib/notify.ts`
