-- ============================================================================
-- 0026_home_addons_jsonb.sql
-- Itemized add-ons on homes. Each add-on has its own cost and markup %.
-- The flat addons_cents / addons_markup_pct fields stay for the generated
-- column; the app computes them from addons_jsonb on save.
-- ============================================================================

alter table public.homes
  add column if not exists addons_jsonb jsonb default '[]'::jsonb;

comment on column public.homes.addons_jsonb is
  'Array of {description, cost_cents, markup_pct} objects. Source of truth for itemized add-ons.';
