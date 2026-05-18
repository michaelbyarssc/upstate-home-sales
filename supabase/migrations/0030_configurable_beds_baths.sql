-- ============================================================================
-- 0030_configurable_beds_baths.sql
-- Allow homes to express configurable bedroom/bathroom counts.
-- e.g. "3 or 4 bedrooms", "2, 2.5, or 3 bathrooms"
--
-- Adds nullable array columns alongside the existing scalar beds/baths.
-- The scalar remains the primary/default value for sorting and SEO.
-- NULL arrays = home has a single fixed configuration (no change in behavior).
-- ============================================================================

-- 1. Add array columns to homes
ALTER TABLE public.homes
  ADD COLUMN IF NOT EXISTS beds_options  int[],
  ADD COLUMN IF NOT EXISTS baths_options numeric(3,1)[];

-- 2. Add array columns to home_models (catalog templates)
ALTER TABLE public.home_models
  ADD COLUMN IF NOT EXISTS beds_options  int[],
  ADD COLUMN IF NOT EXISTS baths_options numeric(3,1)[];

-- 3. GIN indexes for array-contains filtering (e.g. "show 3-bed homes" matches {3,4})
CREATE INDEX IF NOT EXISTS homes_beds_options_idx
  ON public.homes USING GIN (beds_options) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS homes_baths_options_idx
  ON public.homes USING GIN (baths_options) WHERE deleted_at IS NULL;

-- 4. Drop dependent views (same cascade order as 0027)
DROP VIEW IF EXISTS public.public_marketplace_homes;
DROP VIEW IF EXISTS public.public_home_photos;
DROP VIEW IF EXISTS public.public_homes;

-- 5. Recreate public_homes with new columns
CREATE VIEW public.public_homes AS
SELECT
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
  h.beds_options,
  h.baths_options,
  h.sqft,
  h.width_ft,
  h.length_ft,
  h.year_built,
  h.construction,
  CASE WHEN o.prices_hidden THEN NULL ELSE h.listed_price_cents END AS listed_price_cents,
  o.prices_hidden,
  h.starting_from,
  h.headline,
  h.description,
  h.on_lot_since,
  h.is_featured,
  h.created_at
FROM public.homes h
JOIN public.orgs o ON o.id = h.org_id
WHERE h.status = 'published'
  AND h.deleted_at IS NULL
  AND h.hide_from_search = false;

GRANT SELECT ON public.public_homes TO anon, authenticated;

-- 6. Recreate public_home_photos (unchanged, but must recreate due to cascade)
CREATE VIEW public.public_home_photos AS
SELECT
  p.id,
  p.home_id,
  p.storage_path,
  p.sort_order,
  p.alt_text,
  p.width,
  p.height
FROM public.home_photos p
JOIN public.homes h ON h.id = p.home_id
WHERE h.status = 'published'
  AND h.deleted_at IS NULL
  AND h.hide_from_search = false;

GRANT SELECT ON public.public_home_photos TO anon, authenticated;

-- 7. Recreate public_marketplace_homes with new columns
CREATE VIEW public.public_marketplace_homes AS
SELECT
  h.id,
  h.org_id,
  h.stock_no,
  h.name,
  h.model,
  h.type,
  h.beds,
  h.baths,
  h.beds_options,
  h.baths_options,
  h.sqft,
  h.width_ft,
  h.length_ft,
  h.year_built,
  h.construction,
  CASE WHEN o.prices_hidden THEN NULL ELSE h.listed_price_cents END AS listed_price_cents,
  o.prices_hidden,
  h.starting_from,
  h.headline,
  h.description,
  h.on_lot_since,
  h.is_featured,
  h.created_at,
  o.slug         AS org_slug,
  o.name         AS org_name,
  o.logo_url     AS org_logo_url,
  o.brand_color  AS org_brand_color
FROM public.homes h
JOIN public.orgs o ON o.id = h.org_id
WHERE h.status = 'published'
  AND h.deleted_at IS NULL
  AND h.hide_from_search = false
  AND h.marketplace_opt_in = true
  AND o.status = 'active';

GRANT SELECT ON public.public_marketplace_homes TO anon, authenticated;
