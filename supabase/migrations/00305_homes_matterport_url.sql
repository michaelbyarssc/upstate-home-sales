-- ─────────────────────────────────────────────────────────────────────────────
-- 00305_homes_matterport_url.sql
--
-- Renumbered from 0030_homes_matterport_url.sql → 00305 to remove a DUPLICATE
-- migration version: there were two `0030_` files (this one and
-- 0030_configurable_beds_baths.sql), which collide on the schema_migrations
-- primary key when a fresh database replays them in order — breaking branch
-- creation, `supabase db reset`, and any new environment. Version `00305`
-- sorts after `0030` and before `0031`, so it still runs before 0036 (which
-- depends on the matterport_url column). On prod this version is marked
-- applied-without-running (the column already exists; its view-recreate below
-- is superseded by 0036), so the stale view definition is never executed there.
--
-- Adds an optional Matterport 3D-tour URL to each home. When set, the public
-- detail page renders a "View 3D Tour" button that opens the embed in a modal.
--
-- The column is exposed through the public_homes view (the only anon-readable
-- surface for homes), so the view is recreated to include it.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.homes
  add column if not exists matterport_url text;

-- Recreate public_homes view to expose matterport_url.
-- Column list mirrors 0027_addons_setup_markup.sql; only addition is matterport_url.
drop view if exists public.public_homes;

create view public.public_homes as
select
  h.id,
  h.org_id,
  h.lot_id,
  h.stock_no,
  h.name,
  h.manufacturer_id,
  h.model,
  h.type,
  h.beds,
  h.baths,
  h.sqft,
  h.width_ft,
  h.length_ft,
  h.year_built,
  h.construction,
  case when o.prices_hidden then null else h.listed_price_cents end as listed_price_cents,
  o.prices_hidden,
  h.starting_from,
  h.headline,
  h.description,
  h.on_lot_since,
  h.is_featured,
  h.created_at,
  h.matterport_url
from public.homes h
join public.orgs o on o.id = h.org_id
where h.status = 'published'
  and h.deleted_at is null
  and h.hide_from_search = false;

grant select on public.public_homes to anon, authenticated;
