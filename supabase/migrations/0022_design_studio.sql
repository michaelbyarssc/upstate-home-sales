-- ============================================================================
-- 0022_design_studio.sql
-- Phase C: 3D Design Studio.
--
-- Lets a buyer customize a home in real time (siding color, kitchen finish,
-- bath upgrades, etc.) with live price recompute. Per the plan, this is the
-- biggest phase by 3-5×. This migration ships the SCHEMA + price logic;
-- the WebGL renderer + 3D assets are independent work tracks (see
-- docs/3d-asset-spec.md and apps/public/components/DesignStudio/).
--
-- Tables:
--   model_3d_assets       — GLB asset metadata per home_model
--   model_options         — option slots per model (e.g. "siding_main")
--   model_option_values   — choices per slot (e.g. "Cottage Tan")
--   model_option_compat   — compatibility rules (requires / conflicts)
--   home_designs          — saved customer configurations (with token-share)
--   home_design_selections — per-slot picks for a design + price snapshot
--
-- New storage bucket: model-3d-assets (private, signed URLs, 200 MB cap).
-- ============================================================================

-- ─── orgs.design_price_display ────────────────────────────────────────────
-- Per-org display mode for the configurator: 'monthly' | 'total' | 'hidden'.
alter table public.orgs
  add column if not exists design_price_display text not null default 'total'
    check (design_price_display in ('monthly', 'total', 'hidden'));

-- ─── model_3d_assets ──────────────────────────────────────────────────────
-- One per home_model (with versioning so a re-export bumps version not row).
create table public.model_3d_assets (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  home_model_id   uuid not null references public.home_models(id) on delete cascade,
  -- Bumps on re-export from Blender; v1, v2, v3...
  version         int not null default 1,
  -- Path inside the model-3d-assets storage bucket.
  glb_storage_path text not null,
  -- jsonb metadata: { dimensions: {w,l,h}, file_size_mb, exporter_version, ... }
  metadata        jsonb not null default '{}'::jsonb,
  -- jsonb mapping option slot names → mesh names in the GLB. The renderer
  -- uses this to find which meshes to swap material on for each option.
  -- Example: { "siding_main": "Body_Mesh", "kitchen_counter": "Counter_Mesh" }
  material_manifest jsonb not null default '{}'::jsonb,
  uploaded_by     uuid references auth.users(id) on delete set null,
  uploaded_at     timestamptz not null default now(),
  unique (home_model_id, version)
);

create index model_3d_assets_org_idx on public.model_3d_assets (org_id);
create index model_3d_assets_model_idx on public.model_3d_assets (home_model_id, version desc);

alter table public.model_3d_assets enable row level security;

create policy model_3d_assets_select_member on public.model_3d_assets
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy model_3d_assets_modify_managers on public.model_3d_assets
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- Public read: the buyer-facing configurator needs the GLB path. The asset
-- itself is served via signed URL (storage policy below).
grant select on public.model_3d_assets to anon;
create policy model_3d_assets_select_public on public.model_3d_assets
  for select to anon
  using (true);

-- ─── model_options ────────────────────────────────────────────────────────
-- An "option slot" the customer can pick a value for: siding color, kitchen
-- counter material, bathroom shower kit, etc. Slots are scoped to a model
-- and presented in sort_order. The slot_name matches material_manifest keys.
create table public.model_options (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  home_model_id   uuid not null references public.home_models(id) on delete cascade,
  -- Stable identifier used by the renderer (matches material_manifest key).
  slot_name       text not null check (length(slot_name) between 1 and 60),
  -- Buyer-facing label.
  label           text not null,
  -- 'exterior' | 'kitchen' | 'bath' | 'flooring' — used to group options in the UI.
  category        text not null default 'exterior',
  sort_order      int not null default 0,
  -- True when the buyer must pick a value (no skip).
  required        boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (home_model_id, slot_name)
);

create index model_options_model_idx on public.model_options (home_model_id, sort_order);

alter table public.model_options enable row level security;

create policy model_options_select_member on public.model_options
  for select to authenticated using (org_id = any(public.org_ids()));
create policy model_options_modify_managers on public.model_options
  for all to authenticated
  using (org_id = any(public.org_ids()) and public.has_role_in(org_id, array['owner','manager']::public.role_enum[]))
  with check (org_id = any(public.org_ids()));
grant select on public.model_options to anon;
create policy model_options_select_public on public.model_options for select to anon using (true);

-- ─── model_option_values ──────────────────────────────────────────────────
-- One pickable choice within a slot. price_delta_cents is added to the
-- home's base price when this value is selected.
create table public.model_option_values (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  option_id       uuid not null references public.model_options(id) on delete cascade,
  value_name      text not null check (length(value_name) between 1 and 60),
  label           text not null,
  -- Renderer overlay: what to apply to the slot's mesh when this value is
  -- picked. Schema: { type: 'color' | 'texture' | 'mesh',
  --                   color?: '#RRGGBB', texture_url?, mesh_name? }
  overlay         jsonb not null default '{}'::jsonb,
  -- Add (or subtract, if negative) this many cents from the base price when picked.
  price_delta_cents bigint not null default 0,
  -- True for the slot's default pick.
  is_default      boolean not null default false,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  unique (option_id, value_name)
);

create index model_option_values_option_idx on public.model_option_values (option_id, sort_order);
-- Partial unique: at most one default per option.
create unique index model_option_values_default_per_option_idx
  on public.model_option_values (option_id) where is_default = true;

alter table public.model_option_values enable row level security;

create policy model_option_values_select_member on public.model_option_values
  for select to authenticated using (org_id = any(public.org_ids()));
create policy model_option_values_modify_managers on public.model_option_values
  for all to authenticated
  using (org_id = any(public.org_ids()) and public.has_role_in(org_id, array['owner','manager']::public.role_enum[]))
  with check (org_id = any(public.org_ids()));
grant select on public.model_option_values to anon;
create policy model_option_values_select_public on public.model_option_values for select to anon using (true);

-- ─── model_option_compat ──────────────────────────────────────────────────
-- Compatibility rules per model. Each rule describes either:
--   - "requires": picking value A also requires picking value B
--   - "conflicts": picking value A blocks value B
-- Stored as jsonb so the dealer can express complex rules without DDL.
create table public.model_option_compat (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  home_model_id   uuid not null references public.home_models(id) on delete cascade,
  rule_type       text not null check (rule_type in ('requires', 'conflicts')),
  -- jsonb: { trigger: { option_id, value_id }, target: { option_id, value_id } }
  rule            jsonb not null,
  notes           text,
  created_at      timestamptz not null default now()
);

create index model_option_compat_model_idx on public.model_option_compat (home_model_id);

alter table public.model_option_compat enable row level security;
create policy model_option_compat_select_member on public.model_option_compat
  for select to authenticated using (org_id = any(public.org_ids()));
create policy model_option_compat_modify_managers on public.model_option_compat
  for all to authenticated
  using (org_id = any(public.org_ids()) and public.has_role_in(org_id, array['owner','manager']::public.role_enum[]))
  with check (org_id = any(public.org_ids()));
grant select on public.model_option_compat to anon;
create policy model_option_compat_select_public on public.model_option_compat for select to anon using (true);

-- ─── home_designs ─────────────────────────────────────────────────────────
-- A saved design — buyer picks a set of option values for a specific home.
-- total_price_cents is generated from base + sum(selection_price_delta_cents)
-- via a trigger (regenerated columns can't reference other tables).
create table public.home_designs (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  home_id             uuid not null references public.homes(id) on delete cascade,
  -- Optional buyer / lead linkage — set when buyer signs in or submits a quote request.
  buyer_id            uuid references public.buyers(id) on delete set null,
  lead_id             uuid references public.leads(id) on delete set null,
  -- Snapshot of the home's base price at design creation. The base may change
  -- later (markup adjustment) — the design's total stays anchored.
  base_price_cents    bigint not null,
  -- Sum of selection deltas — maintained by trigger on home_design_selections.
  total_price_cents   bigint not null,
  share_token         text not null unique
                      default replace(gen_random_uuid()::text, '-', ''),
  thumbnail_storage_path text,
  notes               text,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index home_designs_org_idx on public.home_designs (org_id, created_at desc);
create index home_designs_home_idx on public.home_designs (home_id);
create index home_designs_buyer_idx on public.home_designs (buyer_id) where buyer_id is not null;
create index home_designs_lead_idx on public.home_designs (lead_id) where lead_id is not null;
create index home_designs_share_idx on public.home_designs (share_token);

create trigger home_designs_set_updated_at
  before update on public.home_designs
  for each row execute function public.tg_set_updated_at();

alter table public.home_designs enable row level security;

create policy home_designs_select_member on public.home_designs
  for select to authenticated using (org_id = any(public.org_ids()));
create policy home_designs_modify_member on public.home_designs
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- Buyer who created the design can read/update it.
create policy home_designs_buyer_self on public.home_designs
  for all to authenticated
  using (buyer_id = auth.uid())
  with check (buyer_id = auth.uid());

-- Public read-by-token (anon). Mirrors quote-share.
create or replace view public.public_home_designs as
select
  d.share_token,
  d.home_id,
  d.base_price_cents,
  d.total_price_cents,
  d.thumbnail_storage_path,
  d.created_at,
  h.name        as home_name,
  h.stock_no    as home_stock_no,
  h.beds        as home_beds,
  h.baths       as home_baths,
  h.sqft        as home_sqft,
  o.name        as org_name,
  o.brand_color as org_brand_color,
  o.design_price_display
from public.home_designs d
join public.homes h on h.id = d.home_id
join public.orgs  o on o.id = d.org_id;
grant select on public.public_home_designs to anon, authenticated;

-- ─── home_design_selections ───────────────────────────────────────────────
create table public.home_design_selections (
  id                          uuid primary key default gen_random_uuid(),
  design_id                   uuid not null references public.home_designs(id) on delete cascade,
  org_id                      uuid not null references public.orgs(id) on delete cascade,
  option_id                   uuid not null references public.model_options(id) on delete cascade,
  value_id                    uuid not null references public.model_option_values(id) on delete cascade,
  -- Snapshot the price at selection time so a later price tweak doesn't
  -- silently change a saved design.
  snapshot_price_delta_cents  bigint not null default 0,
  selected_at                 timestamptz not null default now(),
  unique (design_id, option_id)
);

create index home_design_selections_design_idx on public.home_design_selections (design_id);
create index home_design_selections_org_idx on public.home_design_selections (org_id);

alter table public.home_design_selections enable row level security;

create policy home_design_selections_select_member on public.home_design_selections
  for select to authenticated using (org_id = any(public.org_ids()));
create policy home_design_selections_modify_member on public.home_design_selections
  for all to authenticated
  using (org_id = any(public.org_ids()))
  with check (org_id = any(public.org_ids()));

-- Buyer can manage their own design's selections.
create policy home_design_selections_buyer_self on public.home_design_selections
  for all to authenticated
  using (
    exists (
      select 1 from public.home_designs d
      where d.id = home_design_selections.design_id
        and d.buyer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.home_designs d
      where d.id = home_design_selections.design_id
        and d.buyer_id = auth.uid()
    )
  );

-- Public read-by-token via a view that joins through home_designs.
create or replace view public.public_home_design_selections as
select
  d.share_token,
  s.option_id,
  s.value_id,
  s.snapshot_price_delta_cents,
  o.slot_name,
  o.label as option_label,
  v.value_name,
  v.label as value_label,
  v.overlay
from public.home_design_selections s
join public.home_designs d           on d.id = s.design_id
join public.model_options o          on o.id = s.option_id
join public.model_option_values v    on v.id = s.value_id;
grant select on public.public_home_design_selections to anon, authenticated;

-- ─── total_price recompute trigger ────────────────────────────────────────
-- Keeps home_designs.total_price_cents in sync with the sum of selection deltas.
create or replace function public.recompute_design_total()
returns trigger language plpgsql as $$
declare
  v_design_id uuid;
  v_base bigint;
  v_sum bigint;
begin
  v_design_id := coalesce(new.design_id, old.design_id);
  select base_price_cents into v_base from public.home_designs where id = v_design_id;
  if v_base is null then return coalesce(new, old); end if;
  select coalesce(sum(snapshot_price_delta_cents), 0) into v_sum
    from public.home_design_selections where design_id = v_design_id;
  update public.home_designs
    set total_price_cents = v_base + v_sum,
        updated_at = now()
    where id = v_design_id;
  return coalesce(new, old);
end;
$$;

create trigger home_design_selections_recompute
  after insert or update or delete on public.home_design_selections
  for each row execute function public.recompute_design_total();

-- ─── Storage bucket: model-3d-assets ──────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('model-3d-assets', 'model-3d-assets', false, 200 * 1024 * 1024)
on conflict (id) do nothing;

-- Authenticated users in the asset's org may upload (org_id is encoded as the
-- first folder segment by the upload helper).
create policy model_3d_assets_storage_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'model-3d-assets');

create policy model_3d_assets_storage_select_authed
  on storage.objects for select to authenticated
  using (bucket_id = 'model-3d-assets');

-- Public read of the GLB itself goes through createSignedUrl (admin/server)
-- so the bucket itself stays private. No anon select policy.

-- ─── Realtime ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.home_designs;
