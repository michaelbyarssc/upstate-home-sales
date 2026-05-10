# UHS build status — handoff for next session

Last updated: 2026-05-10

This file is a self-contained snapshot of where the BuildTrove-parity build
sits today. A fresh Claude Code session can read this + `CLAUDE.md` and
keep building without prior context.

---

## TL;DR

**🎉 All planned phases (A–I + C) shipped to `main`.** The codebase is now
at full BuildTrove feature parity.

| Phase | Title | Status |
| ----- | ----- | ------ |
| A | CRM & comms parity | ✅ shipped |
| B | Public site & catalog parity | ✅ shipped |
| C | 3D Design Studio (renderer + configurator) | ✅ shipped (placeholder geom) |
| D | Customer Portal | ✅ shipped |
| E | Property Mapping | ✅ shipped |
| E.2 | DIY parcel pipeline + Local Gradient tile overlay | ✅ shipped |
| F | Multi-location & region pricing | ✅ shipped |
| G | Marketing infra (GMB, FB Shop, GA4/Pixel/GTM, reports) | ✅ shipped |
| H | AI chatbot + NL inventory search | ✅ shipped |
| I | Public API + Marketplace + responsive polish | ✅ shipped |

**Not yet wired** (require external work, none blocking dealer pilot):
- Real photorealistic 3D GLB assets for Phase C (see `docs/3d-asset-spec.md`)
- GMB OAuth flow (Phase G stub is in place; needs verified Google OAuth client)
- Optional: SC county GeoJSON imports for the DIY parcel provider (Phase E.2)
- Optional: GMB/Meta/GA4/GTM IDs entered by the dealer in `/admin/marketing/integrations`
- Optional: `AI_GATEWAY_API_KEY` env var for the chatbot to function

---

## Recently merged PRs (snapshot)

| PR  | Title                                             | Merged       |
| --- | ------------------------------------------------- | ------------ |
| [#3](https://github.com/michaelbyarssc/upstate-home-sales/pull/3) | Phase A+B+D: BuildTrove parity, automations, customer portal | earlier      |
| [#4](https://github.com/michaelbyarssc/upstate-home-sales/pull/4) | Phase E: property mapping with parcel + setback overlay      | 2026-05-10   |
| [#6](https://github.com/michaelbyarssc/upstate-home-sales/pull/6) | Phase E.2: free DIY parcel pipeline + LG tile overlay        | 2026-05-10   |
| [#7](https://github.com/michaelbyarssc/upstate-home-sales/pull/7) | Phase F: multi-location + region pricing                     | 2026-05-10   |
| [#8](https://github.com/michaelbyarssc/upstate-home-sales/pull/8) | Phase G: marketing infra                                     | 2026-05-10   |
| [#9](https://github.com/michaelbyarssc/upstate-home-sales/pull/9) | Phase H: AI chatbot + NL search                              | 2026-05-10   |
| [#10](https://github.com/michaelbyarssc/upstate-home-sales/pull/10) | Phase I: public API + marketplace + responsive polish      | 2026-05-10   |
| [#11](https://github.com/michaelbyarssc/upstate-home-sales/pull/11) | Phase C: 3D Design Studio                                  | 2026-05-10   |

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

### Phase E — Property Mapping (done — PR #4)

Salesperson searches a buyer's address, sees parcel polygon + setback
no-build zone overlaid on Google Maps, drags/rotates a home footprint,
saves it, and shares via token URL.

- **Migration 0016** — `property_placements`, `org_setback_rules`
  (with backfill for every existing org), `parcels_cache` (24h TTL),
  `public_property_placements` view, audit trigger
- **Provider-agnostic parcel client**
  ([`apps/admin/lib/parcels/index.ts`](../apps/admin/lib/parcels/index.ts))
  — selects via `PARCEL_PROVIDER` env: `mock` | `regrid` | `diy`
- **Admin** `/admin/inventory/[id]/place` — search bar, Google Maps
  base, parcel + setback overlays, draggable + rotatable footprint,
  save/share/regenerate-token
- **Public** `/place/[token]` — branded read-only share page,
  mobile-friendly
- **Setback rules form** added to `/admin/settings`
- **"Place on lot" link** on inventory edit page

### Phase E.2 — Free DIY parcel pipeline + LG tile overlay (done — PR #6)

Replaces the $500/mo Regrid dependency with a free DIY provider using
PostGIS + per-county SC GeoJSON imports.

- **Migration 0017** — PostGIS extension, `parcels` table with
  `geometry(MultiPolygon, 4326)` + GiST spatial index, `parcel_imports`
  audit table, `lookup_parcel_by_point(lat, lng)` RPC,
  `upsert_parcels_batch(p_rows jsonb)` RPC
- **DIY provider** in the parcel client — geocodes address via Google
  Maps Geocoding API (server-side key), then ST_Contains against loaded
  county data. Falls back to regrid (if token) or mock when no county
  match.
- **County importer script**
  ([`apps/admin/scripts/import-parcels.ts`](../apps/admin/scripts/import-parcels.ts))
  — `pnpm --filter @uhs/admin import-parcels --file=<path> --county=<name>`.
  Idempotent upsert. Logs to `parcel_imports`.
- **Local Gradient tile overlay** on both admin /place and public
  /place/[token] — blueprint-style raster tiles at zoom 12+, opacity
  0.55 over satellite base. Driven by `NEXT_PUBLIC_LOCAL_GRADIENT_TILE_KEY`.

**Pending sub-task:** load SC county GeoJSON files (downloaded from
Local Gradient bulk export or county GIS portals) for the 10 highest
MH-density counties: Lexington, Spartanburg, Anderson, York, Greenville,
Pickens, Cherokee, Oconee, Aiken, Sumter.

---

## Database state — all 17 migrations applied to remote Supabase

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
| 0016  | `property_mapping.sql`                      | property_placements, org_setback_rules, parcels_cache, public_property_placements view, audit trigger |
| 0017  | `parcels_diy.sql`                           | postgis extension, parcels (geom MultiPolygon + GiST), parcel_imports, lookup_parcel_by_point + upsert_parcels_batch RPCs |
| 0018  | `locations.sql`                             | locations table (default-per-org backfill), lots.location_id, leads.assigned_location_id, home_region_pricing, region_kind enum, effective_price_for_home RPC |
| 0019  | `marketing_infra.sql`                       | pgcrypto, org_integrations (encrypted creds), gmb_reviews, visitor_events, public_org_integrations view, integration/event enums |
| 0020  | `ai.sql`                                    | orgs.ai_chat_enabled / ai_daily_token_cap / faq_markdown, chat_sessions, chat_messages, nl_search_queries, chat_role enum |
| 0021  | `api_marketplace.sql`                       | org_api_keys, marketplace_views, homes.marketplace_opt_in, public_marketplace_homes view, validate_api_key RPC |
| 0022  | `design_studio.sql`                         | orgs.design_price_display, model_3d_assets, model_options/values/compat, home_designs + selections, recompute_design_total trigger, model-3d-assets bucket |

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
- **Phase H:** `AI_GATEWAY_API_KEY` (public app, for the chatbot via
  Vercel AI Gateway). Optional: `AI_CHAT_MODEL` to override the default
  `anthropic/claude-sonnet-4-6`. Without the gateway key, the chatbot
  returns errors but the rest of the site works.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- **Phase E:** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (browser, both apps),
  `GOOGLE_MAPS_GEOCODING_KEY` (server, admin), `PARCEL_PROVIDER=diy`
  (admin), `NEXT_PUBLIC_LOCAL_GRADIENT_TILE_KEY` (both)

### Env vars set in Vercel

All of the above are wired across all 3 envs (Production / Preview /
Development) on both `uhs-admin` and `uhs-public` projects, with two
exceptions:

- `SUPABASE_SERVICE_ROLE_KEY` is **Production-only on uhs-admin** by
  design (preview deploys are broadly accessible; we don't expose the
  RLS-bypass admin credential there). Server-side admin actions on
  preview deploys will fail; auth + read-only flows work.
- `RESEND_*` and `TWILIO_*` are Production-only on uhs-admin too.
  Preview deploys can't send outbound email/SMS.

Other env vars:

- `CRON_SECRET` — required for `/api/cron/campaign-tick`. Pick any
  long random string, set it in the admin Vercel project settings.
- `NEXT_PUBLIC_PUBLIC_URL=https://upstatehomecenter.com` (defaults to
  this if unset, but explicit is better)
- `NEXT_PUBLIC_ADMIN_URL=https://admin.upstatehomecenter.com`

### Monitoring (Sentry — optional)

Sentry SDK scaffolded in both apps; **no-op when DSN is unset**. To enable:

- `NEXT_PUBLIC_SENTRY_DSN` (both apps) — browser error reporting
- `SENTRY_DSN` (both apps) — server-side error reporting
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (build env) — source-map upload at build time. Without `SENTRY_AUTH_TOKEN`, the build skips Sentry's webpack wrapper entirely.

### E2E tests (Playwright)

`pnpm test:e2e` runs the smoke suite at `tests/e2e/smoke.spec.ts` against
`PLAYWRIGHT_BASE_URL` (default `https://upstatehomecenter.com`). Covers
home / inventory / marketplace / location sub-site / Design Studio /
financing / contact + the public API + token-share 404 pages. CI run is a
follow-up — currently this is a manual command.

### AI chatbot (Phase H — wired, awaits billing)

- `AI_GATEWAY_API_KEY` is set on `uhs-public` for all 3 envs (created at vercel.com/<team>/~/ai-gateway).
- `ai_chat_enabled` is **true** on the `uhs-spartanburg` org.
- Chat endpoint streams successfully; LLM calls return `AI Gateway requires a valid credit card on file to service requests`. **Add a card at https://vercel.com/&lt;team&gt;/~/ai → modal=add-credit-card to unlock $5 free credit and start serving.**

---

## Remaining wire-up work (post-engineering)

All planned engineering phases are merged. The remaining items below are
external dependencies and follow-on UX touches — none block dealer pilot.

### Per-dealer setup (do once)

- **Google Maps:** Browser key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) +
  server geocoding key (`GOOGLE_MAPS_GEOCODING_KEY`) — already wired in
  Vercel for Upstate Home Sales as of 2026-05-10.
- **Local Gradient tile key:** wired (Phase E.2).
- **Google Business Profile:** complete the OAuth flow (stub at
  `/api/cron/gmb-sync` — needs verified Google OAuth client ID/secret).
- **GA4 / GTM / Meta Pixel IDs:** dealer pastes them in
  `/admin/marketing/integrations` — auto-injected into public layout.
- **AI chatbot:** dealer toggles `ai_chat_enabled` in
  `/admin/settings/ai`. Requires `AI_GATEWAY_API_KEY` env on `uhs-public`.
- **Public API keys:** dealer creates in `/admin/settings/api-keys`.

### Optional content imports

- **SC county GeoJSON imports:** for the free DIY parcel provider.
  Run `pnpm --filter @uhs/admin import-parcels --file=<path> --county=<n>`
  per county GeoJSON download (Local Gradient bulk or county GIS portal).
- **3D GLB assets** for Design Studio: contract artists, license, or
  vendor — see [`docs/3d-asset-spec.md`](./3d-asset-spec.md). The renderer
  falls back to placeholder geometry until real assets land.

### Engineering follow-ups (small, none blocking)

- Phase G — GMB OAuth flow page + live Google Business Profile API call
  inside the cron stub.
- Phase G — Reply-to-review UI; geographic heat-map; client-side
  visitor_events firing from public components.
- Phase H — Wire NL search into public `/inventory` search bar; build
  `/admin/reports/ai` dashboards.
- Phase C — Admin option/value editor at `/admin/catalog/[id]/options`;
  GLB upload UI; photo-fallback configurator for low-end mobile;
  "Convert design to quote" button.
- Pre-existing — Move Google Fonts to `next/font/google` (lint warning
  in both apps' layouts; harmless).

### Reference plan

The original phase plan (with all gating decisions for each) lives at
`/Users/Michael/.claude/plans/next-phases-per-the-synthetic-lampson.md`.

---

<!-- Phase summaries below kept for historical reference. -->

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
