-- ============================================================================
-- 0010_addons_setup_markup.sql
-- Per-line markup percentages for add-ons and setup/delivery.
-- Previously, markup_pct only applied to base_price_cents. Now the dealer can
-- mark up each of (base, addons, setup) independently.
-- ============================================================================

alter table public.homes
  add column addons_markup_pct numeric(5,2) not null default 0,
  add column setup_markup_pct  numeric(5,2) not null default 0;

-- Recompute the generated column with the new formula. Postgres requires a
-- drop+add for generated-column expressions.
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

-- Extend the pricing role gate to the new fields so only owner/manager can
-- change them. (Same shape as the existing trigger in 0004_inventory.sql.)
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

-- Extend the audit trigger to record the new fields on price changes.
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
