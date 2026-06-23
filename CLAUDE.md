# Instructions for Claude Code

You're picking up a **high-fidelity HTML prototype** of a multi-tenant SaaS for South Carolina manufactured home dealers, called **Upstate Home Sales (UHS)**. Your job is to turn it into a working production app.

---

## ⚠ Default workflow — test, commit, and push on every completed task

After completing **any** task, follow this loop **without being asked**:

1. **Test the change.** For UI/frontend work, start the dev server and exercise the feature in a browser (golden path + edge cases, watch for regressions). For backend/logic, run the relevant tests or scripts. Type-checking and unit tests verify correctness, not feature behavior — if you can't actually test the feature, say so explicitly instead of claiming success.
2. **If everything works**, immediately:
   - `git add` the relevant files (specific paths, not `git add -A`)
   - `git commit` with a clear message describing the *why*
   - `git push` to the GitHub remote (this triggers Vercel auto-deploy via the connected integration)
3. **If anything fails**, fix it first. Don't commit broken work.

You do **not** need to ask permission to commit and push when tests pass — that authorization is granted in advance by this file. Still respect the safety rules: never `--force` push, never skip hooks, never commit secrets, never push to `main` if a feature branch is in use.

If Vercel deploy fails after push, surface the failure and investigate before declaring the task done.

---

## ⚠ Email + DNS stack — DO NOT REVERT

Email is **Resend** (outbound), migrated from SendGrid in commit `81af731` and later moved from the legacy `upstatehomesales.com` domains to the current brand domain. State below was verified against the Resend API and live DNS on 2026-06-10:

- **Outbound email:** Resend, verified sending domain **`mail.upstatehomecenter.com`**, from address `hello@mail.upstatehomecenter.com`. The old `mail.upstatehomesales.com` shows status **failed** in Resend and is dead — never point env at it, and never use the bare apex `upstatehomecenter.com` (not a verified sender; see incident note below). Code lives in `apps/admin/lib/notify.ts` and `apps/public/lib/notify.ts`. Env: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.
- **Env values live in** Vercel project settings (**uhs-public** + **uhs-admin**, production *and* preview) and in `.env.local` at the repo root (`apps/public/.env.local` and `apps/admin/.env.local` are symlinks to it). Vercel env edits do nothing until a redeploy — after changing email env, run the checklist in `docs/email-setup.md` § "After changing email env". Resend send failures return `ok:false` without throwing, so a bad `RESEND_FROM_EMAIL` fails **silently**: in 2026-06 a stale apex value 403'd every production send for ~34 days before anyone noticed.
- **Inbound email — code shipped, activation pending:** the webhook (`apps/public/app/api/webhooks/inbound-email/route.ts`) natively accepts **Resend Inbound** `email.received` events (Svix-signed, secret in `RESEND_WEBHOOK_SECRET` on uhs-public; body fetched from Resend's Received Emails API) and still accepts the dormant legacy Cloudflare Worker transport (`workers/inbound-email-router/`, bearer `INBOUND_WEBHOOK_SECRET`). Replies to `replies+{token}@replies.upstatehomecenter.com` **keep bouncing until** the operator finishes the activation checklist in `docs/email-setup.md` § "Inbound replies" (Resend receiving domain + GoDaddy MX + webhook secret). Do **not** re-introduce Cloudflare Email Routing or move nameservers to "fix" inbound — Resend Inbound is the chosen transport and DNS stays on GoDaddy.
- **DNS:** both `upstatehomecenter.com` and `upstatehomesales.com` delegate to **GoDaddy nameservers** (`*.domaincontrol.com`) — manage records in the GoDaddy DNS dashboard. The Cloudflare-era scripts (`scripts/cloudflare-dns-apply.sh`, `scripts/cloudflare-dns-apply-newdomain.sh`) and `scripts/godaddy-dns-apply.sh` are all **deprecated** and exit 1 on run.
- **Full walkthrough + incident history:** `docs/email-setup.md`.

**Do NOT** add `SENDGRID_API_KEY` env vars, `@sendgrid/*` packages, SendGrid Inbound Parse webhooks, or DNS records pointing to `*.sendgrid.net`/`*.wlNNN.sendgrid.net`. If a session is asked to "set up SendGrid" or to re-point email at any `upstatehomesales.com` address, surface this section and confirm before proceeding — the requester may not realize the migrations happened.

---

## Read these files in this order

1. **`handoff.html`** — the technical spec. Read it cover to cover. It contains the full Supabase data model, RLS policies, generated SQL, API surface, auth flow, storage buckets, env vars, and a week-by-week build roadmap. **This is your primary source of truth.**
2. **`README.md`** — orientation.
3. **`brand/00-brand.html`** — brand identity (palette, type, voice). Match this in production.
4. **`site/00-overview.html`** + **`admin/00-overview.html`** — visual overviews of every screen. Open in a browser; the artboards are interactive.
5. **`research/01-teardown.html`** — competitive analysis + 5 differentiators UHS is built around. Useful context for product decisions.

---

## What to build (in order)

The handoff doc has a full 7-week roadmap in **section 10 — "Cutover roadmap"**. Follow it. Each week is independently shippable to the dealer for real use.

**Week 1 — Foundation**
Spin up Supabase project. Apply schema migrations matching `handoff.html` section 02. Implement RLS policies (section 02 → "Row-level security"). Wire Supabase Auth + the `org_members` join table. Build `org-switcher.html` as a real screen.

**Week 2 — Inventory CRUD**
Admin: list page + edit page. **Critical**: implement the markup model exactly as section 03 specifies — `listed_price_cents` MUST be a Postgres generated column, not a client calculation. Public site reads from a `public_homes` view that excludes `base_price_cents` and `markup_pct`.

**Weeks 3–7** — Public site, leads, two-way comms, quotes, polish. See handoff section 10.

---

## Non-negotiables

These come straight from the prototype's defining decisions. Don't deviate without product sign-off:

1. **Pricing visibility is enforced at the database, not the app.** Base price and markup % must never be exposed via the anon key. Use the `public_homes` view + grant select-on-view to anon. Never grant select on the `homes` table to anon.

2. **Multi-tenancy via RLS, always.** Every business table has `org_id`. Every policy uses `auth.org_ids()`. There are no "trusted" code paths that bypass RLS — even server-side rendering goes through PostgREST with the user's JWT.

3. **Quotes snapshot the price.** When a quote is sent, copy `listed_price_cents` into `quotes.listed_price_cents`. If the dealer raises the markup % later, outstanding quotes hold their original price.

4. **Realtime on the leads inbox.** Don't poll. Use Supabase Realtime channels filtered by `org_id`.

5. **The CSS in `design-system/` is the design source of truth.** Lift it into your production styling system (Tailwind theme extensions or CSS variables). Don't redesign — the prototype is opinionated and the brand guide is locked.

---

## Stack

Recommended in `handoff.html` section 01:
- **Frontend**: Next.js 14 (App Router) on Vercel, two apps — `apps/public` (marketing + inventory) and `apps/admin` (dealer dashboard).
- **Backend**: Supabase — Postgres + Auth + Storage + Edge Functions + Realtime.
- **Email**: ~~SendGrid~~ — handoff's original pick, superseded in production by **Resend** (see ⚠ Email + DNS section above).
- **SMS**: Twilio.

The repo structure is in **section 08**.

---

## Six product questions to resolve before you start

At the very bottom of `handoff.html` (section 11) there are six open product questions. **Read them and ask the human before you write a line of code.** Each one changes the schema or the lead flow. They are:

1. Pricing visibility default — confirmed?
2. Lead claim model — round-robin, claim-first, or manual?
3. SMS opt-in — explicit checkbox or implied by quote-form submit?
4. Financing pre-qual storage — does PII land in our DB?
5. Audit retention — SC regulatory requirements?
6. Multi-org users — build the switcher in v1, or one-org-per-user?

---

## What this prototype is NOT

- Not a component library. Don't try to use the prototype HTML as React components. Rebuild in your component library of choice.
- Not pixel-final on responsive. Mobile breakpoints are sketched, not nailed. Match the desktop fidelity on mobile during the build.
- Not seeded with real data. All photos are placeholder gradients, all customers are fictional.

---

## When you're done with v1

Run a manual QA against the prototype's screens. Open `admin/inventory-edit.html` and `admin/leads-inbox.html` side-by-side with your built versions — every field, badge, and interaction in the prototype should exist in production. The "live calc" on the inventory edit page is a hard requirement — typing a markup % must update the listed price in real time, and the public preview card on the right must mirror it.

Good luck. The hard problem is the multi-tenant pricing model — get that right and the rest is straightforward CRUD.
