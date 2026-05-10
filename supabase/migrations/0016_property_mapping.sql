-- ============================================================================
-- 0016_property_mapping.sql
-- Phase E: property mapping with parcel boundaries and home-footprint placement.
--
-- A salesperson (or buyer, via share link) can pick a SC property by address
-- or APN, see the parcel polygon overlaid on Google Maps, see the org's
-- setback "no-build" zone hatched in red, and drag a home footprint
-- rectangle to a position. Saved placements get a token-share URL so the
-- buyer can revisit on their phone (read-only on mobile).
--
-- Tables:
--   property_placements   - one row per saved placement; org-scoped
--   org_setback_rules     - per-org defaults for front/side/rear setbacks
--   parcels_cache         - 24h cache of Regrid lookups so revisits don't re-bill
--   public_property_placements view - anon-readable by share_token only
--
-- The parcel polygon GeoJSON itself is denormalized onto property_placements
-- so a saved placement is self-contained (no Regrid call needed to render).
-- ============================================================================

-- ─── parcels_cache ─────────────────────────────────────────────────────────
-- Cache Regrid responses for 24h. Address/APN → normalized parcel JSON.
-- Cache key is whatever lookup string the client used (lower-cased, trimmed).
-- TTL is enforced at read-time in the Regrid client; rows are pruned by a
-- Supabase scheduled function (see audit_retention pattern).
create table public.parcels_cache (
  cache_key       text primary key,
  parcel_id       text not null,
  address         text,
  county          text,
  centroid_lat    double precision not null,
  centroid_lng    double precision not null,
  geojson         jsonb not null,
  raw             jsonb,
  cached_at       timestamptz not null default now()
);

create index parcels_cache_age_idx on public.parcels_cache (cached_at);

-- Cache is read by org members (their server actions); not exposed to anon.
alter table public.parcels_cache enable row level security;

create policy parcels_cache_select_authed on public.parcels_cache
  for select to authenticated
  using (true);

create policy parcels_cache_modify_authed on public.parcels_cache
  for all to authenticated
  using (true)
  with check (true);

-- ─── org_setback_rules ─────────────────────────────────────────────────────
-- One row per org defining the default setback distances applied to the
-- "no-build" zone overlay. Per-placement overrides could come later;
-- defaults are fine for v1 (most SC counties use the same minimums).
create table public.org_setback_rules (
  org_id              uuid primary key references public.orgs(id) on delete cascade,
  front_ft            int not null default 25 check (front_ft >= 0 and front_ft <= 200),
  side_ft             int not null default 10 check (side_ft >= 0 and side_ft <= 200),
  rear_ft             int not null default 25 check (rear_ft >= 0 and rear_ft <= 200),
  road_easement_ft    int not null default 0  check (road_easement_ft >= 0 and road_easement_ft <= 200),
  updated_at          timestamptz not null default now()
);

create trigger org_setback_rules_set_updated_at
  before update on public.org_setback_rules
  for each row execute function public.tg_set_updated_at();

alter table public.org_setback_rules enable row level security;

create policy org_setback_rules_select on public.org_setback_rules
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy org_setback_rules_modify on public.org_setback_rules
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- Backfill: insert a default row for every existing org so the join in the
-- placement page always finds a row.
insert into public.org_setback_rules (org_id)
select id from public.orgs
on conflict (org_id) do nothing;

-- ─── property_placements ───────────────────────────────────────────────────
create table public.property_placements (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  -- Optional ties: a placement can be associated with a specific home (and
  -- through it, the home's dimensions) OR a specific lead, OR both, OR
  -- neither (e.g., a salesperson exploring a property before any home is picked).
  home_id             uuid references public.homes(id) on delete set null,
  lead_id             uuid references public.leads(id) on delete set null,
  -- Display name for the placement ("123 Main St — Aspect placement").
  -- Auto-derived from address + home if not provided.
  label               text,
  -- The lookup string used (address or APN). For provenance + cache hit on revisit.
  search_query        text not null,
  -- Regrid-supplied parcel id (their `parcelnumb` or similar identifier).
  parcel_id           text,
  -- Full parcel polygon in GeoJSON Polygon shape. Denormalized so a saved
  -- placement renders without re-calling Regrid.
  parcel_geojson      jsonb not null,
  -- Centroid (used as default footprint anchor + as map center).
  parcel_lat          double precision not null,
  parcel_lng          double precision not null,
  -- Home footprint dimensions in feet — copied from homes.{width_ft,length_ft}
  -- at placement time, or set manually if no home is linked.
  footprint_w_ft      int not null check (footprint_w_ft > 0 and footprint_w_ft <= 200),
  footprint_l_ft      int not null check (footprint_l_ft > 0 and footprint_l_ft <= 200),
  -- The footprint anchor is the home's center point.
  anchor_lat          double precision not null,
  anchor_lng          double precision not null,
  -- Rotation in degrees (0 = home long-axis points north). Stored as int 0-359.
  orientation_deg     int not null default 0 check (orientation_deg >= 0 and orientation_deg < 360),
  -- Address/county for header display + future lead-routing by region.
  address             text,
  county              text,
  -- Token-share: anonymous read-only access for the buyer. Always populated.
  share_token         text not null unique default replace(gen_random_uuid()::text, '-', ''),
  notes               text,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index property_placements_org_idx on public.property_placements (org_id, created_at desc);
create index property_placements_lead_idx on public.property_placements (lead_id) where lead_id is not null;
create index property_placements_home_idx on public.property_placements (home_id) where home_id is not null;
create index property_placements_share_idx on public.property_placements (share_token);

create trigger property_placements_set_updated_at
  before update on public.property_placements
  for each row execute function public.tg_set_updated_at();

alter table public.property_placements enable row level security;

create policy property_placements_select_org on public.property_placements
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy property_placements_modify_org on public.property_placements
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- ─── public_property_placements view ───────────────────────────────────────
-- Anonymous read by share_token only. Strips internal columns (created_by,
-- lead_id, home_id, notes) — buyers see the placement, not the org context.
-- Joins org name + brand color so the share page can be branded without an
-- extra round-trip.
--
-- View runs as the view owner (postgres / security definer by default for
-- views without `security_invoker = on`), bypassing the underlying RLS so
-- anon can read by share_token. Same pattern as public_quotes / public_homes.
create view public.public_property_placements as
select
  pp.share_token,
  pp.label,
  pp.address,
  pp.county,
  pp.parcel_geojson,
  pp.parcel_lat,
  pp.parcel_lng,
  pp.footprint_w_ft,
  pp.footprint_l_ft,
  pp.anchor_lat,
  pp.anchor_lng,
  pp.orientation_deg,
  pp.created_at,
  -- Org branding for the share page chrome.
  o.name        as org_name,
  o.brand_color as org_brand_color,
  o.logo_url    as org_logo_url,
  -- Setbacks from the org's defaults — the share page draws the no-build zone too.
  coalesce(sr.front_ft, 25)         as setback_front_ft,
  coalesce(sr.side_ft, 10)          as setback_side_ft,
  coalesce(sr.rear_ft, 25)          as setback_rear_ft,
  coalesce(sr.road_easement_ft, 0)  as setback_road_easement_ft,
  -- Optional home metadata (so the share page can show "Aspect, 1813 sqft").
  h.name        as home_name,
  h.stock_no    as home_stock_no,
  h.beds        as home_beds,
  h.baths       as home_baths,
  h.sqft        as home_sqft
from public.property_placements pp
left join public.orgs o            on o.id = pp.org_id
left join public.org_setback_rules sr on sr.org_id = pp.org_id
left join public.homes h           on h.id = pp.home_id;

grant select on public.public_property_placements to anon, authenticated;

-- ─── Audit trigger ─────────────────────────────────────────────────────────
-- Reuse the existing emit_audit() helper from migration 0002.
create or replace function public.tg_audit_property_placement()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_audit(
      new.org_id, 'property_placement.created', 'property_placements', new.id,
      null,
      jsonb_build_object(
        'address',   new.address,
        'parcel_id', new.parcel_id,
        'home_id',   new.home_id,
        'lead_id',   new.lead_id
      ),
      null
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if  new.anchor_lat        is distinct from old.anchor_lat
     or new.anchor_lng        is distinct from old.anchor_lng
     or new.orientation_deg   is distinct from old.orientation_deg
     or new.footprint_w_ft    is distinct from old.footprint_w_ft
     or new.footprint_l_ft    is distinct from old.footprint_l_ft
    then
      perform public.emit_audit(
        new.org_id, 'property_placement.updated', 'property_placements', new.id,
        jsonb_build_object(
          'anchor_lat',      old.anchor_lat,
          'anchor_lng',      old.anchor_lng,
          'orientation_deg', old.orientation_deg,
          'footprint_w_ft',  old.footprint_w_ft,
          'footprint_l_ft',  old.footprint_l_ft
        ),
        jsonb_build_object(
          'anchor_lat',      new.anchor_lat,
          'anchor_lng',      new.anchor_lng,
          'orientation_deg', new.orientation_deg,
          'footprint_w_ft',  new.footprint_w_ft,
          'footprint_l_ft',  new.footprint_l_ft
        ),
        null
      );
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.emit_audit(
      old.org_id, 'property_placement.deleted', 'property_placements', old.id,
      to_jsonb(old), null, null
    );
    return old;
  end if;

  return null;
end;
$$;

create trigger property_placements_audit
  after insert or update or delete on public.property_placements
  for each row execute function public.tg_audit_property_placement();

-- ─── Realtime ──────────────────────────────────────────────────────────────
-- Lead detail page subscribes so a placement saved on another tab/device
-- updates the lead pane live.
alter publication supabase_realtime add table public.property_placements;
