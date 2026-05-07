-- ============================================================================
-- 0006_public_homes_definer.sql
-- Flip public_homes / public_home_photos from security_invoker to security
-- definer (the default). The views are the only anon-readable surface; they
-- own the published-row filter, and we deliberately want them to bypass
-- anon's lack of SELECT on the underlying homes table.
-- ============================================================================

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
  h.listed_price_cents,
  h.starting_from,
  h.headline,
  h.description,
  h.on_lot_since,
  h.is_featured,
  h.created_at
from public.homes h
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
