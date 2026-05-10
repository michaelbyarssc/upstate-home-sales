-- ============================================================================
-- 0012_pricing_visibility.sql
-- Phase B.5: tiered pricing visibility per org.
--
-- Adds orgs.prices_hidden (boolean, default false). When true, public_homes
-- view returns NULL for listed_price_cents so the frontend renders
-- "Contact for pricing" instead of a number — without exposing the markup
-- model or base price.
-- ============================================================================

alter table public.orgs
  add column prices_hidden boolean not null default false;

-- Recreate the public_homes view to mask the price when the org has
-- prices_hidden = true. starting_from is still revealed so the frontend
-- knows whether to render the "Starting from" qualifier when prices are on.
drop view if exists public.public_home_photos;
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
  h.created_at
from public.homes h
join public.orgs o on o.id = h.org_id
where h.status = 'published'
  and h.deleted_at is null
  and h.hide_from_search = false;

create view public.public_home_photos as
select
  p.id,
  p.home_id,
  p.storage_path,
  p.sort_order,
  p.alt_text,
  p.width,
  p.height
from public.home_photos p
join public.homes h on h.id = p.home_id
where h.status = 'published'
  and h.deleted_at is null
  and h.hide_from_search = false;

grant select on public.public_homes to anon, authenticated;
grant select on public.public_home_photos to anon, authenticated;
