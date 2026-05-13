-- ============================================================================
-- 0027_addons_setup_markup.sql
-- Per-line markup percentages for add-ons and setup/delivery.
-- Previously, markup_pct only applied to base_price_cents. Now the dealer can
-- mark up each of (base, addons, setup) independently.
--
-- NOTE: This was originally 0010_addons_setup_markup.sql but had a naming
-- conflict with 0010_home_models.sql and was never applied to remote.
-- ============================================================================

-- 1. Add the new markup columns
alter table public.homes
  add column if not exists addons_markup_pct numeric(5,2) not null default 0,
  add column if not exists setup_markup_pct  numeric(5,2) not null default 0;

-- 2. Drop views that depend on listed_price_cents
drop view if exists public.public_marketplace_homes;
drop view if exists public.public_home_photos;
drop view if exists public.public_homes;

-- 3. Recompute the generated column with the new formula
alter table public.homes drop column listed_price_cents;

alter table public.homes
  add column listed_price_cents bigint generated always as (
    ((base_price_cents::numeric * (100 + markup_pct))::bigint / 100)
    + ((addons_cents::numeric * (100 + addons_markup_pct))::bigint / 100)
    + (case when include_setup_in_price
            then ((setup_cents::numeric * (100 + setup_markup_pct))::bigint / 100)
            else 0
       end)
  ) stored;

-- 4. Recreate public_homes view (from 0012_pricing_visibility.sql)
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

grant select on public.public_homes to anon, authenticated;

-- 5. Recreate public_home_photos view (from 0012_pricing_visibility.sql)
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

grant select on public.public_home_photos to anon, authenticated;

-- 6. Recreate public_marketplace_homes view (from 0021_api_marketplace.sql)
create view public.public_marketplace_homes as
select
  h.id,
  h.org_id,
  h.stock_no,
  h.name,
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
  o.slug         as org_slug,
  o.name         as org_name,
  o.logo_url     as org_logo_url,
  o.brand_color  as org_brand_color
from public.homes h
join public.orgs o on o.id = h.org_id
where h.status = 'published'
  and h.deleted_at is null
  and h.hide_from_search = false
  and h.marketplace_opt_in = true
  and o.status = 'active';

grant select on public.public_marketplace_homes to anon, authenticated;

-- 7. Update the pricing role gate trigger
create or replace function public.tg_homes_pricing_role()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (
       new.base_price_cents       is distinct from old.base_price_cents
    or new.markup_pct             is distinct from old.markup_pct
    or new.addons_cents           is distinct from old.addons_cents
    or new.addons_markup_pct      is distinct from old.addons_markup_pct
    or new.setup_cents            is distinct from old.setup_cents
    or new.setup_markup_pct       is distinct from old.setup_markup_pct
    or new.include_setup_in_price is distinct from old.include_setup_in_price
  ) then
    if not public.has_role_in(new.org_id, array['owner','manager']::public.role_enum[]) then
      raise exception 'Only owner/manager can change pricing fields'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- 8. Update the audit trigger
create or replace function public.tg_homes_audit()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_audit(
      new.org_id, 'home.created', 'homes', new.id, null, to_jsonb(new), null
    );
  elsif tg_op = 'UPDATE' then
    if (new.base_price_cents is distinct from old.base_price_cents
        or new.markup_pct is distinct from old.markup_pct
        or new.addons_cents is distinct from old.addons_cents
        or new.addons_markup_pct is distinct from old.addons_markup_pct
        or new.setup_cents is distinct from old.setup_cents
        or new.setup_markup_pct is distinct from old.setup_markup_pct) then
      perform public.emit_audit(
        new.org_id, 'home.pricing.changed', 'homes', new.id,
        jsonb_build_object(
          'base_price_cents', old.base_price_cents,
          'markup_pct', old.markup_pct,
          'addons_cents', old.addons_cents,
          'addons_markup_pct', old.addons_markup_pct,
          'setup_cents', old.setup_cents,
          'setup_markup_pct', old.setup_markup_pct,
          'listed_price_cents', old.listed_price_cents
        ),
        jsonb_build_object(
          'base_price_cents', new.base_price_cents,
          'markup_pct', new.markup_pct,
          'addons_cents', new.addons_cents,
          'addons_markup_pct', new.addons_markup_pct,
          'setup_cents', new.setup_cents,
          'setup_markup_pct', new.setup_markup_pct,
          'listed_price_cents', new.listed_price_cents
        ),
        null
      );
    end if;
    if new.status is distinct from old.status then
      perform public.emit_audit(
        new.org_id, 'home.status.changed', 'homes', new.id,
        jsonb_build_object('status', old.status),
        jsonb_build_object('status', new.status),
        null
      );
    end if;
  end if;
  return new;
end;
$$;
