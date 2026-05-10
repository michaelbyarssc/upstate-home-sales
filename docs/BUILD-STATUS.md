# UHS build status — handoff for next session

Last updated: 2026-05-09

This file is a self-contained snapshot of where the BuildTrove-parity build
sits today. A fresh Claude Code session can read this + `CLAUDE.md` and
keep building without prior context.

---

## TL;DR

- **Three feature branches are open as PRs against `main`** — none merged yet.
- Phases **A (CRM finisher)**, **B (public site & catalog parity)**, and
  **D (Customer Portal)** are built, lint/typecheck-clean, and have green
  Vercel preview deploys.
- Phases **C, E, F, G, H, I** are not started. The plan for each is in
  `/Users/Michael/.claude/plans/i-need-you-to-cozy-noodle.md` (also
  summarized below in case the plan file isn't available).

---

## Open PRs

| PR  | Branch                          | Title                                  | Status                |
| --- | ------------------------------- | -------------------------------------- | --------------------- |
| [#2](https://github.com/michaelbyarssc/upstate-home-sales/pull/2) | `phase-a-b-buildtrove-parity` | Phase A finisher + Phase B: BuildTrove parity | All checks green; awaiting merge |
| [#3](https://github.com/michaelbyarssc/upstate-home-sales/pull/3) | `phase-d-customer-portal`     | Phase D: Customer Portal               | All checks green; awaiting merge. Branch is built on top of phase-a-b. |

**Merge order matters**: PR #2 first, then PR #3 (otherwise you'll get
merge conflicts, since #3 includes #2's commits as parent history).
Alternatively, merge #3 alone — it will subsume #2 because it contains
all of #2's commits.

After merging, **delete the merged branches** to avoid confusion. Local
branches can be removed with `git branch -D phase-a-b-buildtrove-parity
phase-d-customer-portal`.

---

## What's been built

### Phase A — CRM & comms parity (done)

Engines and admin UIs for marketing automation.

- **Migration 0011** (UTM columns, `lead_stage_history`,
  `org_members.in_rotation`, `quote_signatures` + view + audit,
  `campaigns/steps/enrollments`, `workflow_rules`/`workflow_runs`)
- **UTM attribution** capture in
  [`apps/public/lib/attribution.ts`](../apps/public/lib/attribution.ts);
  surfaced on lead detail and aggregated at
  [`/admin/reports/sources`](../apps/admin/app/(app)/reports/sources/page.tsx)
- **Kanban pipeline** at
  [`/admin/leads/kanban`](../apps/admin/app/(app)/leads/kanban/page.tsx)
- **Round-robin** opt-in toggle on
  [`/admin/users`](../apps/admin/app/(app)/users/users-table.tsx)
- **E-sign on quotes** — signature pad on
  [`/q/[token]`](../apps/public/app/q/[token]/sign-block.tsx) +
  `quote_signatures` table
- **Workflow event dispatcher**
  ([`apps/admin/lib/workflows.ts`](../apps/admin/lib/workflows.ts),
  duplicated to public) wired into 4 events: `lead.created`,
  `lead.stage.changed`, `quote.sent`, `quote.signed`. 5 action types:
  `enroll_in_campaign`, `assign_lead`, `set_stage`, `tag`,
  `notify_email`.
- **Drip campaign tick** at
  [`apps/admin/lib/campaign-tick.ts`](../apps/admin/lib/campaign-tick.ts) +
  cron endpoint at `/api/cron/campaign-tick`. Vercel cron runs **once
  daily at 13:00 UTC** (Hobby tier limit). Bump to `*/5 * * * *`
  in [`apps/admin/vercel.json`](../apps/admin/vercel.json) once on Pro.
- **Admin section** at
  [`/admin/automations/{campaigns,workflows}`](../apps/admin/app/(app)/automations/)
  with full CRUD (campaign step editor + workflow action builder).
- **"Enroll in campaign"** dropdown on the lead detail meta-pane.

### Phase B — public site & catalog parity (done)

7 features over and above the existing inventory CRUD:

- **Migration 0012** — `orgs.prices_hidden` + masked `public_homes` view
- **Migration 0013** — `delivery_zones` + buyer-readable RLS
- **Migration 0014** — `home_collections` + `home_collection_members` +
  public views
- **SEO** — JSON-LD (`AutoDealer`, `ItemList`, `Product`+`Offer`) on
  home / list / detail pages. Dynamic
  [`/sitemap.xml`](../apps/public/app/sitemap.ts) +
  [`/robots.txt`](../apps/public/app/robots.ts)
- **Loan calculator** at `/financing` with chattel / land+home /
  traditional presets + monthly-budget reverse mode (3.5% down default).
  Detail card deep-links via `?price=`
- **Side-by-side compare** at
  [`/inventory/compare?ids=`](../apps/public/app/inventory/compare/page.tsx)
  with sticky compare bar across the public site
- **Smart recommendations** on detail page (manufacturer + type + price
  band scoring) + recently-viewed cookie
- **Kiosk mode** at [`/kiosk`](../apps/public/app/kiosk/) (chrome-less +
  5-min idle reset + embedded contact form)
- **Tiered pricing visibility** — admin toggle in Settings; "Contact for
  pricing" fallback across HomeCard, QuoteForm, kiosk, compare
- **Geographic delivery zones** — admin chips manager in Settings +
  buyer-facing zip-lookup banner on /inventory
- **Collections** — admin CRUD at `/admin/collections` + slug-routed
  public landing pages at `/inventory/collection/[slug]` + chip row
  above inventory list

### Phase D — Customer Portal (done)

Branded buyer-facing portal with email+password and magic-link auth.

- **Migration 0015** — `buyers`, `buyer_lead_links`, `buyer_documents`,
  `buyer_suggested_homes`, `lead_milestones` + `buyer-documents`
  storage bucket (private, signed-URL access only) + full RLS
- **Buyer auth** at `/portal/{login,signup,reset}` + auth callback +
  buyers upsert endpoint
- **Dashboard** at `/portal` — suggested-homes grid + recent milestones
- **`/portal/documents`** — upload to private storage with 60-second
  signed-URL preview + delete
- **`/portal/milestones`** — read-only timeline grouped by lead
- **`/portal/profile`** — contact + notification toggles + password
  change + recovery-mode banner
- **Admin "BuyerPortalPanel"** on lead detail with linked-buyer status,
  "Suggest a home" form, and milestone CRUD. Auto-links a buyer to a
  lead when their signup email matches `leads.email`.

### Bonus — Trove-aesthetic restyle (off-plan, in PR #2)

- HomeCard restyle (pipe specs + dual CTAs)
- Inventory list grouped by sqft band with breadcrumb
- Detail two-pane gallery + sticky icon-bullet summary card
- Hero photo on home page
- Loan calculator pills use brick brand color

---

## Database state — all 15 migrations applied to remote Supabase

Project ref: **`ojtudvezjvrcdqgbrnyc`**. CLI is logged in with the
project linked. To reapply or push new migrations:

```bash
cd "/Users/Michael/Upstate Home Sales "
supabase migration list           # see local-vs-remote state
supabase db push                  # push pending migrations
```

Migration history:

| #     | File                                        | Adds                                                                |
| ----- | ------------------------------------------- | ------------------------------------------------------------------- |
| 0001  | `tenancy_auth.sql`                          | orgs, org_members, RLS helpers                                      |
| 0002  | `audit_retention.sql`                       | system_events, audit infra                                          |
| 0003  | `platform_admins.sql`                       | platform admins                                                     |
| 0004  | `inventory.sql`                             | manufacturers, lots, homes, home_photos, public_homes view          |
| 0005  | `storage_buckets.sql`                       | home-photos, quote-pdfs, tradein-photos, org-branding               |
| 0006  | `public_homes_definer.sql`                  | view security_definer flip                                          |
| 0007  | `leads.sql`                                 | leads, lead_messages, quotes, trade_ins, round-robin assigner       |
| 0008  | `audit_extensions.sql`                      | richer audit triggers                                               |
| 0009  | `system_events_and_tradein_consent.sql`     | tradein consent fields                                              |
| 0010  | `home_models.sql`                           | home_models, home_model_photos                                      |
| 0011  | `phase_a_crm.sql`                           | UTM, lead_stage_history, in_rotation, quote_signatures, campaigns, workflow_rules, workflow_runs |
| 0012  | `pricing_visibility.sql`                    | orgs.prices_hidden + masked public_homes view                       |
| 0013  | `delivery_zones.sql`                        | delivery_zones table                                                |
| 0014  | `collections.sql`                           | home_collections, home_collection_members, public_collections view  |
| 0015  | `customer_portal.sql`                       | buyers, buyer_lead_links, buyer_documents, buyer_suggested_homes, lead_milestones, buyer-documents bucket |

---

## Environment & deploy

### Vercel projects

- **`uhs-public`** — `apps/public`, custom domain
  `upstatehomecenter.com`
- **`uhs-admin`** — `apps/admin`, custom domain
  `admin.upstatehomecenter.com`
- Vercel **Hobby** plan currently — daily-only crons. Once on Pro, bump
  the schedule in [`apps/admin/vercel.json`](../apps/admin/vercel.json)
  to `*/5 * * * *` for tighter drip-campaign timing.

### Supabase

- Project ref `ojtudvezjvrcdqgbrnyc`
- Email confirmation **off** — buyer signup creates a session
  immediately. To require confirm-on-signup, toggle on in Supabase Auth
  settings; the `/portal/auth/callback` route already handles the flow.

### Required env vars (already in `apps/admin/.env.local` + `apps/public/.env.local`)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (admin only)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `LEAD_NOTIFY_EMAIL`,
  `EMAIL_INBOUND_DOMAIN`, `INBOUND_WEBHOOK_SECRET`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`

### Env vars to set in Vercel (production)

- All of the above
- `CRON_SECRET` — required for `/api/cron/campaign-tick`. Pick any
  long random string, set it in the admin Vercel project settings.
- `NEXT_PUBLIC_PUBLIC_URL=https://upstatehomecenter.com` (defaults to
  this if unset, but explicit is better)
- `NEXT_PUBLIC_ADMIN_URL=https://admin.upstatehomecenter.com`

---

## Phases not yet started

In recommended order. Pick whichever you want next.

### Phase E — Property Mapping (~2 weeks, smallest remaining)

Address/APN search + parcel boundary visualization with home-footprint
placement and setback overlay.

**Gating decision**: pick a parcel-data API. Options:

- **Regrid** — ~$500/mo for SC coverage. Full parcel polygons + owner
  data. Most popular in the manufactured-home space.
- **LightBox** — enterprise pricing.
- **Estated** — cheaper but spotty coverage in rural SC.

Ask the user before picking. Once decided, build:

1. New table `property_placements` (org_id, lead_id?, parcel_id, lat,
   lng, footprint_w_ft, footprint_l_ft, orientation_deg, share_token)
2. Admin page `/admin/inventory/[id]/place` and public mirror
   `/inventory/[stock]/place` — Mapbox/Leaflet base + parcel overlay +
   draggable footprint with model dimensions
3. Setback rules from org config (front/side/rear ft) → red zone overlay
4. Save placements; share via token URL (mirror the quote-share pattern)
5. Mobile read-only view

### Phase F — Multi-location & region pricing (~2 weeks)

Trove charges per-location. Today UHS models one-org = one-dealer
implicitly; this phase lets a single dealer have multiple physical
locations with shared inventory but per-location branding/pricing.

1. **Migration** — `locations` table (id, org_id, slug, name, address,
   phone, hours_jsonb, brand_color, logo_url). Migrate `lots` to
   children of `locations` (or merge concepts).
2. **Master/sub-site routing** —
   `apps/public/app/[locationSlug]/page.tsx` route group; lead routing
   by buyer zip → nearest location.
3. **Region-based pricing** — `home_region_pricing` table (home_id,
   region, override_price_cents). View checks region from buyer zip.
4. **Per-location settings** — branding, hours, contact, social.

### Phase G — Marketing infra (~2 weeks)

Plumbing for the dealer to plug in their own GMB / pixels / FB Shop
(no managed service infra, just enablement).

1. **GMB OAuth** + post-on-create flow (Google Business Profile API)
2. **Facebook Shop feed** at `/api/feeds/facebook-shop.xml` (Product
   Feed XML from `homes` + `home_photos`)
3. **Review aggregation** — pull GMB reviews into admin + render on
   public site
4. **Pixel installer** — admin fields for GA4 / GTM / Meta Pixel IDs;
   inject into public layout
5. **Reports** — extend `/admin/reports/` with conversion funnel +
   traffic-by-source dashboard
6. **Heat map** — visitor city aggregation from IP

### Phase H — AI features (~2 weeks)

1. **AI chatbot** on public site — Claude API (per CLAUDE.md, default
   to latest Sonnet/Opus). System prompt loads org's inventory + FAQ.
   Hands off to lead form when user signals interest.
2. **AI natural language search** — small ranker that converts "3 bed
   under 80k" → SQL filters via Claude tool-use.
3. **Schema markup tuning** for AI Overviews (Phase B already adds
   the basics).

### Phase I — Public API + Marketplace + polish (~2 weeks)

1. **Public API** — read-only endpoints for inventory, models. API keys
   in `org_api_keys` table; rate-limited.
2. **Cross-dealer Marketplace** — opt-in flag on `homes`; aggregator at
   `marketplace.upstatehomecenter.com` (or `/marketplace/`) routes
   leads back to the listing org.
3. **Mobile responsive polish** across all admin and portal screens.

### Phase C — 3D Design Studio (~16-24 weeks, biggest)

Trove's marquee feature. Real-time photorealistic 3D renderings as the
customer customizes a home. Three sub-tracks running partly in
parallel.

**Critical gating decision** (week 1 of Phase C): pick the 3D asset
source. Options ranked by cost vs. control:

- **Buy/license from manufacturers** (Clayton, Cavco, Champion may
  license existing CAD/3D for marketing) — cheapest if available
- **Contract 3D artists** — Blender/3ds Max work, ~$1,500-4,000 per
  model. Need ~30-50 models for a credible launch catalog.
- **Use a configurator vendor** (Threekit, 3D Cloud by Marxent,
  ZakekiBuild) — turnkey but $2,000-10,000/mo + setup

Ask the user before starting Phase C. Until decided, do not write code.

Sub-tracks once the asset route is set:

- **C.1 — 3D asset pipeline** (8-12 weeks). Per home model: GLB/GLTF
  with separated materials + named option slots. New Supabase Storage
  bucket `model-3d-assets`.
- **C.2 — WebGL renderer** (4-6 weeks). React Three Fiber + Drei +
  GLTFJSX. Camera presets, material swap engine, compatibility rules,
  mobile graceful degradation.
- **C.3 — Configurator UX & pricing** (4-6 weeks). Option panel,
  generated `home_designs.total_price_cents` column, save/share token,
  "Convert to quote" button.

---

## How to continue in a new session

1. **Read this file first**, then `CLAUDE.md`.
2. **Check git state**: `cd "/Users/Michael/Upstate Home Sales " && git
   branch --show-current && git status` — figure out which branch is
   live and whether PR #2/#3 have been merged.
3. **Confirm migrations are in sync**: `supabase migration list`. If
   anything is out of sync, run `supabase db push`.
4. **Pick a phase** from "Phases not yet started" above. Start each
   new phase on its own branch (`git switch -c phase-X-name`).
5. **For each phase**, follow the pattern: migration → types in
   `packages/db/src/types.ts` → admin actions → UI → verify in browser
   → commit + push → open PR. Run `pnpm typecheck && pnpm lint` before
   pushing — both must be clean or CI/Vercel will fail.
6. **Direct push to `main` is blocked** by repo settings; always work
   on a feature branch and open a PR via `gh pr create`.

The full BuildTrove gap-analysis lives at
`/Users/Michael/.claude/plans/i-need-you-to-cozy-noodle.md` —
read it for deeper rationale on each phase.

---

## Known follow-ups (small, not blockers)

- **Admin UI font-loading warning** in `apps/admin/app/layout.tsx` and
  `apps/public/app/layout.tsx` — pre-existing, low priority. Move
  Google Fonts to `next/font/google`.
- **Pre-existing controlled/uncontrolled input warning** in
  `apps/admin/app/(app)/inventory/home-form.tsx` — flagged in dev
  console, doesn't block anything.
- **`/api/leads` env error** in local dev when
  `SUPABASE_SERVICE_ROLE_KEY` is missing in `apps/public/.env.local`
  — works fine in production. To test lead intake locally, copy the
  service-role key from `apps/admin/.env.local` to public's.
- **CRON_SECRET** must be set in Vercel admin project before the
  campaign tick will work in production.
- **Buyer→lead auto-linking** happens on first
  `suggestHomeForLead` call when emails match. No manual invite flow
  yet — could add an "Invite to portal" button that sends a magic-link
  if the buyer hasn't signed up.
