-- ============================================================================
-- 0013_delivery_zones.sql
-- Phase B.6: per-org delivery zones.
--
-- A dealer enumerates the zips and/or counties they deliver to. The public
-- site uses this two ways:
--   1. As a soft filter on /inventory — buyer enters their zip, gets a banner
--      saying "we deliver here" or "this is outside our usual area, contact us".
--   2. (Future) As a hard filter when multi-location lands in Phase F so leads
--      route to the location closest to the buyer.
--
-- An org with NO zones defined = "delivers everywhere", no filtering.
-- ============================================================================

create type public.zone_kind as enum ('zip', 'county');

create table public.delivery_zones (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  kind        public.zone_kind not null,
  -- For kind='zip' this is a 5-digit US zip; for kind='county' a county name.
  value       text not null check (length(value) > 0 and length(value) <= 80),
  -- Optional friendly label so the dealer can group zips ("Spartanburg metro").
  label       text,
  created_at  timestamptz not null default now(),
  unique (org_id, kind, value)
);

create index delivery_zones_org_idx on public.delivery_zones (org_id);
create index delivery_zones_zip_idx on public.delivery_zones (value) where kind = 'zip';

alter table public.delivery_zones enable row level security;

create policy delivery_zones_select_member on public.delivery_zones
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy delivery_zones_modify_managers on public.delivery_zones
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- Public read access (anon) so the buyer-side zip lookup can answer
-- "do you deliver to this zip?" without requiring auth.
grant select on public.delivery_zones to anon;
create policy delivery_zones_select_public on public.delivery_zones
  for select to anon
  using (true);
