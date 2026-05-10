-- ============================================================================
-- 0018_locations.sql
-- Phase F: multi-location + region-based pricing.
--
-- Today UHS implicitly models one-org = one-dealer-site. This migration
-- introduces an explicit `locations` table (a physical dealer site with its
-- own address, hours, branding, and proximity coordinates), then makes
-- `lots` children of locations and `leads` routable by buyer-zip → nearest
-- location.
--
-- Decision (confirmed in plan): "locations contain lots". We backfill by
-- creating exactly one default location per existing org named "Main" and
-- pointing all existing lots + leads at it, so existing dealers see no
-- behavior change until they create additional locations.
--
-- Also adds:
--   - home_region_pricing: per-zip / per-county / per-state price overrides
--     per home, with effective dates for seasonal or campaign pricing.
--   - effective_price_for_home(home_id, region_type, region_value): RPC
--     that returns the active override or null (caller falls back to the
--     home's own listed_price_cents).
-- ============================================================================

-- ─── locations ─────────────────────────────────────────────────────────────
create table public.locations (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  -- URL slug, scoped to the org. Used in /[locationSlug]/inventory routes.
  slug                text not null check (length(slug) between 1 and 60 and slug ~ '^[a-z0-9-]+$'),
  name                text not null,
  address             text,
  city                text,
  state               text check (state is null or length(state) = 2),
  zip                 text check (zip is null or zip ~ '^\d{5}(-\d{4})?$'),
  phone               text,
  -- Per-location hours, e.g. {"mon":"9-6","tue":"9-6",...,"sun":"closed"}.
  hours_jsonb         jsonb,
  -- Per-location branding overrides; if null, falls back to org defaults.
  brand_color         text check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_storage_path   text,
  -- Coordinates for proximity-based lead routing. Null = location not used
  -- for routing (lookups will fall back to the org's default location).
  lat                 double precision,
  lng                 double precision,
  -- Exactly one location per org should be default; enforced by partial
  -- unique index below.
  is_default          boolean not null default false,
  -- Soft-delete pattern (matches lots).
  deleted_at          timestamptz,
  deleted_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (org_id, slug)
);

create index locations_org_idx on public.locations (org_id) where deleted_at is null;
-- Partial unique: only one row per org may have is_default=true (and not be soft-deleted).
create unique index locations_default_per_org_idx
  on public.locations (org_id) where is_default = true and deleted_at is null;
create index locations_geo_idx on public.locations (lat, lng) where lat is not null and lng is not null;

create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function public.tg_set_updated_at();

alter table public.locations enable row level security;

create policy locations_select_member on public.locations
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy locations_modify_managers on public.locations
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- Public read: the per-location sub-site (anon) needs to look up name +
-- branding + hours by slug. Sensitive fields (lat/lng, manager email,
-- soft-delete metadata) are fine to expose at the public site too — none
-- of them are PII.
grant select on public.locations to anon;
create policy locations_select_public on public.locations
  for select to anon
  using (deleted_at is null);

-- ─── Backfill default location per existing org ────────────────────────────
-- Creates exactly one "Main" location per org, copying address from the
-- first existing lot (if any) to seed coordinates later.
insert into public.locations (org_id, slug, name, address, is_default, created_at)
select
  o.id,
  'main',
  'Main',
  -- Pull first lot's address as the location address (best-effort seed).
  (select address from public.lots where org_id = o.id and deleted_at is null order by created_at limit 1),
  true,
  now()
from public.orgs o
on conflict (org_id, slug) do nothing;

-- ─── lots: add location_id (children of a location) ────────────────────────
alter table public.lots
  add column if not exists location_id uuid references public.locations(id) on delete set null;

create index if not exists lots_location_idx on public.lots (location_id) where location_id is not null;

-- Backfill: every existing lot points to its org's default location.
update public.lots l
set location_id = (
  select id from public.locations
  where org_id = l.org_id and is_default = true and deleted_at is null
  limit 1
)
where l.location_id is null and l.deleted_at is null;

-- ─── leads: add assigned_location_id ───────────────────────────────────────
alter table public.leads
  add column if not exists assigned_location_id uuid references public.locations(id) on delete set null;

create index if not exists leads_assigned_location_idx
  on public.leads (assigned_location_id) where assigned_location_id is not null;

-- Backfill: route every existing lead to its org's default location.
update public.leads l
set assigned_location_id = (
  select id from public.locations
  where org_id = l.org_id and is_default = true and deleted_at is null
  limit 1
)
where l.assigned_location_id is null;

-- ─── home_region_pricing ───────────────────────────────────────────────────
-- Per-region price overrides per home. The dealer's own price logic
-- (`homes.base_price_cents` × markup) sets the *baseline*; overrides
-- replace the listed price for buyers in the matching region only.
create type public.region_kind as enum ('zip', 'county', 'state');

create table public.home_region_pricing (
  id                  uuid primary key default gen_random_uuid(),
  home_id             uuid not null references public.homes(id) on delete cascade,
  -- org_id denormalized for RLS without an extra join.
  org_id              uuid not null references public.orgs(id) on delete cascade,
  region_type         public.region_kind not null,
  -- For region_type='zip' a 5-digit US zip; for 'county' the county name;
  -- for 'state' a 2-letter state code. Length cap is generous to cover counties.
  region_value        text not null check (length(region_value) between 1 and 80),
  override_price_cents bigint not null check (override_price_cents > 0),
  -- Effective dates for seasonal / campaign pricing. Null = always-on.
  effective_at        timestamptz,
  expires_at          timestamptz check (expires_at is null or expires_at > effective_at),
  notes               text,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- One override per (home, region), enforced so the dealer doesn't accidentally
  -- create overlapping rules. To replace, update the row.
  unique (home_id, region_type, region_value)
);

create index home_region_pricing_home_idx on public.home_region_pricing (home_id);
create index home_region_pricing_org_idx on public.home_region_pricing (org_id);
create index home_region_pricing_region_idx on public.home_region_pricing (region_type, region_value);

create trigger home_region_pricing_set_updated_at
  before update on public.home_region_pricing
  for each row execute function public.tg_set_updated_at();

alter table public.home_region_pricing enable row level security;

create policy home_region_pricing_select_member on public.home_region_pricing
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy home_region_pricing_modify_managers on public.home_region_pricing
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- ─── effective_price_for_home: regional pricing RPC ────────────────────────
-- Public site calls this with the buyer's region (derived from middleware
-- cookie + zip→county lookup). Returns the active override price, or null
-- when none applies — caller then falls back to the home's listed_price_cents.
create or replace function public.effective_price_for_home(
  p_home_id     uuid,
  p_zip         text default null,
  p_county      text default null,
  p_state       text default null
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  -- Resolution priority: zip > county > state. Most specific override wins.
  -- An expired/not-yet-effective row is excluded.
  select override_price_cents
  from public.home_region_pricing rp
  where rp.home_id = p_home_id
    and (rp.effective_at is null or rp.effective_at <= now())
    and (rp.expires_at is null or rp.expires_at > now())
    and (
      (rp.region_type = 'zip'    and p_zip    is not null and rp.region_value = p_zip) or
      (rp.region_type = 'county' and p_county is not null and lower(rp.region_value) = lower(p_county)) or
      (rp.region_type = 'state'  and p_state  is not null and upper(rp.region_value) = upper(p_state))
    )
  order by case rp.region_type when 'zip' then 1 when 'county' then 2 when 'state' then 3 end
  limit 1;
$$;

revoke all on function public.effective_price_for_home(uuid, text, text, text) from public;
grant execute on function public.effective_price_for_home(uuid, text, text, text) to anon, authenticated;

-- ─── Audit triggers ────────────────────────────────────────────────────────
-- Reuse emit_audit() helper from migration 0002.
create or replace function public.tg_audit_locations()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_audit(
      new.org_id, 'location.created', 'locations', new.id,
      null, jsonb_build_object('slug', new.slug, 'name', new.name), null
    );
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.is_default is distinct from old.is_default then
      perform public.emit_audit(
        new.org_id, 'location.default.changed', 'locations', new.id,
        jsonb_build_object('is_default', old.is_default),
        jsonb_build_object('is_default', new.is_default), null
      );
    end if;
    if new.deleted_at is distinct from old.deleted_at and new.deleted_at is not null then
      perform public.emit_audit(
        new.org_id, 'location.deleted', 'locations', new.id, to_jsonb(old), null, null
      );
    end if;
    return new;
  end if;
  return new;
end;
$$;

create trigger locations_audit
  after insert or update on public.locations
  for each row execute function public.tg_audit_locations();

create or replace function public.tg_audit_home_region_pricing()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_audit(
      new.org_id, 'home_region_pricing.created', 'home_region_pricing', new.id,
      null,
      jsonb_build_object(
        'home_id', new.home_id, 'region_type', new.region_type,
        'region_value', new.region_value,
        'override_price_cents', new.override_price_cents
      ),
      null
    );
    return new;
  end if;
  if tg_op = 'UPDATE' and new.override_price_cents is distinct from old.override_price_cents then
    perform public.emit_audit(
      new.org_id, 'home_region_pricing.changed', 'home_region_pricing', new.id,
      jsonb_build_object('override_price_cents', old.override_price_cents),
      jsonb_build_object('override_price_cents', new.override_price_cents),
      null
    );
    return new;
  end if;
  if tg_op = 'DELETE' then
    perform public.emit_audit(
      old.org_id, 'home_region_pricing.deleted', 'home_region_pricing', old.id,
      to_jsonb(old), null, null
    );
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger home_region_pricing_audit
  after insert or update or delete on public.home_region_pricing
  for each row execute function public.tg_audit_home_region_pricing();

-- ─── Realtime ──────────────────────────────────────────────────────────────
-- Locations may change while admin is viewing (e.g., another teammate
-- adds/edits one). Region-pricing is admin-only, lower urgency, but
-- subscribing is cheap.
alter publication supabase_realtime add table public.locations;
alter publication supabase_realtime add table public.home_region_pricing;
