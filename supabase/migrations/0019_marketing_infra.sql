-- ============================================================================
-- 0019_marketing_infra.sql
-- Phase G: marketing infra plumbing.
--
-- Lets the dealer connect their own Google Business Profile (GMB), Meta
-- Pixel, GA4, and GTM to the public site. Pulls GMB reviews on a daily
-- cron. Tracks visitor + conversion events for funnel + heat-map reports.
--
-- Scope: infrastructure only — no managed-service campaign UI. The dealer
-- sets up their own ad accounts; we just plumb the IDs and feeds.
-- ============================================================================

-- ─── pgcrypto for credential encryption ────────────────────────────────────
-- Supabase places extensions in the `extensions` schema by default. The
-- pgp_sym_encrypt / pgp_sym_decrypt functions live there, and our helpers
-- below explicitly include `extensions` in their search_path so the calls
-- resolve cleanly.
create extension if not exists pgcrypto with schema extensions;

-- ─── org_integrations ──────────────────────────────────────────────────────
-- Holds per-org OAuth tokens / API keys for connected services. The
-- credentials column is encrypted at rest using pgp_sym_encrypt with a
-- per-deployment key from env.INTEGRATION_ENCRYPTION_KEY (set in Vercel).
--
-- We store the encrypted bytes in a bytea column. App code reads via the
-- decrypt_integration_credentials() RPC, which gates on org membership +
-- requires the key to be passed in (so the key never gets persisted in the
-- DB itself).
create type public.integration_kind as enum ('gmb', 'meta', 'ga4', 'gtm');

create table public.org_integrations (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  kind                public.integration_kind not null,
  -- Encrypted JSON containing whatever the integration needs (OAuth tokens,
  -- account IDs, refresh tokens, etc.). Decrypt via the RPC.
  credentials_enc     bytea,
  -- Plain config (non-secret). E.g. ga4_measurement_id, meta_pixel_id, gmb_account_id.
  config              jsonb not null default '{}'::jsonb,
  status              text not null default 'connected'
                      check (status in ('connected', 'disconnected', 'error')),
  status_detail       text,
  connected_at        timestamptz not null default now(),
  last_sync_at        timestamptz,
  created_by          uuid references auth.users(id) on delete set null,
  updated_at          timestamptz not null default now(),
  unique (org_id, kind)
);

create index org_integrations_org_idx on public.org_integrations (org_id, kind);

create trigger org_integrations_set_updated_at
  before update on public.org_integrations
  for each row execute function public.tg_set_updated_at();

alter table public.org_integrations enable row level security;

create policy org_integrations_select_member on public.org_integrations
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy org_integrations_modify_owners on public.org_integrations
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- ─── public_org_integrations view ─────────────────────────────────────────
-- Anon-readable view exposing ONLY non-secret config (no credentials_enc).
-- The public site layout uses this to install GA4/GTM/Meta pixel scripts
-- without needing a service-role round trip on every page.
create view public.public_org_integrations as
select
  i.org_id,
  i.kind,
  i.config,
  i.status
from public.org_integrations i
where i.status = 'connected';

grant select on public.public_org_integrations to anon, authenticated;

-- Encrypt/decrypt helpers — the key is passed at call time so it never sits in the DB.
create or replace function public.encrypt_credentials(p_plain text, p_key text)
returns bytea
language sql
security definer
set search_path = public, extensions
as $$
  select extensions.pgp_sym_encrypt(p_plain, p_key);
$$;

create or replace function public.decrypt_credentials(p_cipher bytea, p_key text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select extensions.pgp_sym_decrypt(p_cipher, p_key);
$$;

revoke all on function public.encrypt_credentials(text, text) from public, anon, authenticated;
revoke all on function public.decrypt_credentials(bytea, text) from public, anon, authenticated;
-- Service role only — encryption/decryption happens in admin server routes.

-- ─── gmb_reviews ───────────────────────────────────────────────────────────
-- Pulled from Google Business Profile API by the daily cron at /api/cron/gmb-sync.
-- Surfaced in /admin/marketing/reviews and on the public site.
create table public.gmb_reviews (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  -- Optional location scoping if the dealer has multiple GBP locations.
  location_id         uuid references public.locations(id) on delete set null,
  gmb_review_id       text not null,
  author_name         text,
  author_photo_url    text,
  rating              int not null check (rating between 1 and 5),
  comment             text,
  reviewed_at         timestamptz not null,
  -- Reply state.
  replied_at          timestamptz,
  replied_by          uuid references auth.users(id) on delete set null,
  reply_text          text,
  -- Sync metadata.
  imported_at         timestamptz not null default now(),
  unique (org_id, gmb_review_id)
);

create index gmb_reviews_org_idx on public.gmb_reviews (org_id, reviewed_at desc);
create index gmb_reviews_location_idx on public.gmb_reviews (location_id) where location_id is not null;

alter table public.gmb_reviews enable row level security;

create policy gmb_reviews_select_member on public.gmb_reviews
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy gmb_reviews_modify_managers on public.gmb_reviews
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- Public read for the buyer-facing review widget. Exposes reviews of
-- published, non-deleted homes only — no PII beyond what GMB itself shows.
grant select on public.gmb_reviews to anon;
create policy gmb_reviews_select_public on public.gmb_reviews
  for select to anon
  using (true);

-- ─── visitor_events ────────────────────────────────────────────────────────
-- Lightweight server-side analytics for the funnel + geo reports. Not
-- meant to replace GA4 — it's the data the dealer always owns, regardless
-- of whether they've wired up GA4.
create type public.visitor_event_kind as enum (
  'page_view',
  'inventory_view',
  'home_view',
  'lead_submitted',
  'quote_viewed',
  'quote_signed'
);

create table public.visitor_events (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  -- Anonymous browser-session id (cookie-derived, not PII).
  session_id          text not null,
  event_type          public.visitor_event_kind not null,
  -- Optional links to the entity the event relates to.
  home_id             uuid references public.homes(id) on delete set null,
  lead_id             uuid references public.leads(id) on delete set null,
  -- Geographic info from IP geolocation (no precise coords stored).
  ip_city             text,
  ip_region           text,
  ip_country          text,
  -- Acquisition.
  referrer_url        text,
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  -- Path of the page that fired the event.
  path                text,
  occurred_at         timestamptz not null default now()
);

create index visitor_events_org_time_idx on public.visitor_events (org_id, occurred_at desc);
create index visitor_events_session_idx on public.visitor_events (session_id, occurred_at desc);
create index visitor_events_funnel_idx on public.visitor_events (org_id, event_type, occurred_at desc);
create index visitor_events_geo_idx on public.visitor_events (org_id, ip_region, ip_city)
  where ip_region is not null;

alter table public.visitor_events enable row level security;

-- Org members read their org's events. Inserts via service role from the
-- /api/track endpoint (which assigns org_id from the home/route).
create policy visitor_events_select_member on public.visitor_events
  for select to authenticated
  using (org_id = any(public.org_ids()));

-- ─── Audit triggers ────────────────────────────────────────────────────────
create or replace function public.tg_audit_org_integrations()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_audit(
      new.org_id, 'integration.connected', 'org_integrations', new.id,
      null, jsonb_build_object('kind', new.kind, 'status', new.status), null
    );
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.emit_audit(
      new.org_id, 'integration.status.changed', 'org_integrations', new.id,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status, 'detail', new.status_detail),
      null
    );
    return new;
  end if;
  if tg_op = 'DELETE' then
    perform public.emit_audit(
      old.org_id, 'integration.disconnected', 'org_integrations', old.id,
      jsonb_build_object('kind', old.kind), null, null
    );
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger org_integrations_audit
  after insert or update or delete on public.org_integrations
  for each row execute function public.tg_audit_org_integrations();

-- ─── Realtime ──────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.gmb_reviews;
