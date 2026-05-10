-- ============================================================================
-- 0010_home_models.sql
-- Home model catalog: reusable templates for stocking lots. Splits the
-- "what is this product" data (specs, photos, copy) from the "this specific
-- physical unit on a specific lot" data (stock_no, pricing, lot_id, status).
--
-- Per-org isolation is enforced via org_id NOT NULL + RLS policies that
-- mirror the homes table. Anon never reads home_models.
-- ============================================================================

-- ─── home_models ────────────────────────────────────────────────────────────
create table public.home_models (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  manufacturer_id uuid references public.manufacturers(id),

  name            text not null,
  model_code      text,
  series          text,

  type            public.home_type not null default 'double',
  beds            int,
  baths           numeric(3,1),
  sqft            int,
  width_ft        int,
  length_ft       int,
  year_built      int,
  construction    text,

  headline        text,
  description     text,
  source_url      text,

  deleted_at      timestamptz,
  deleted_by      uuid references auth.users(id),
  created_by      uuid references auth.users(id),
  updated_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint home_models_unique_per_org unique (org_id, name)
);

create index home_models_org_idx on public.home_models (org_id) where deleted_at is null;
create index home_models_mfr_idx on public.home_models (manufacturer_id) where deleted_at is null;
create index home_models_search_idx
  on public.home_models using gin (to_tsvector('english',
    coalesce(name,'') || ' ' || coalesce(model_code,'') || ' ' || coalesce(series,'') || ' ' || coalesce(headline,'')));

-- ─── home_model_photos ──────────────────────────────────────────────────────
create table public.home_model_photos (
  id              uuid primary key default gen_random_uuid(),
  home_model_id   uuid not null references public.home_models(id) on delete cascade,
  org_id          uuid not null references public.orgs(id) on delete cascade,
  storage_path    text not null,
  sort_order      int not null default 0,
  alt_text        text,
  width           int,
  height          int,
  created_at      timestamptz not null default now()
);

create index home_model_photos_model_idx on public.home_model_photos (home_model_id, sort_order);
create index home_model_photos_org_idx on public.home_model_photos (org_id);

-- ─── homes.model_id (back-reference for traceability) ──────────────────────
alter table public.homes
  add column model_id uuid references public.home_models(id) on delete set null;

create index homes_model_idx on public.homes (model_id) where model_id is not null and deleted_at is null;

-- ─── RLS · home_models ─────────────────────────────────────────────────────
alter table public.home_models enable row level security;

create policy home_models_select_member on public.home_models
  for select to authenticated
  using (
    deleted_at is null
    and org_id = any(public.org_ids())
    and (public.active_org() is null or org_id = public.active_org())
  );

create policy home_models_insert_member on public.home_models
  for insert to authenticated
  with check (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  );

create policy home_models_update_member on public.home_models
  for update to authenticated
  using (
    deleted_at is null
    and org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (
    org_id = any(public.org_ids())
  );

create policy home_models_delete_owner on public.home_models
  for delete to authenticated
  using (public.has_role_in(org_id, array['owner']::public.role_enum[]));

-- Anon NEVER reads home_models — catalog is internal.
revoke all on public.home_models from anon;

-- ─── RLS · home_model_photos ───────────────────────────────────────────────
alter table public.home_model_photos enable row level security;

create policy home_model_photos_select_member on public.home_model_photos
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy home_model_photos_modify_member on public.home_model_photos
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  );

revoke all on public.home_model_photos from anon;

-- ─── updated_at + actor triggers ───────────────────────────────────────────
create trigger home_models_set_updated_at
  before update on public.home_models
  for each row execute function public.tg_set_updated_at();

create or replace function public.tg_home_models_actor()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, auth.uid());
  elsif tg_op = 'UPDATE' then
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$$;

create trigger home_models_actor
  before insert or update on public.home_models
  for each row execute function public.tg_home_models_actor();

-- ─── Audit emit on create / soft-delete ────────────────────────────────────
create or replace function public.tg_home_models_audit()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_audit(
      new.org_id, 'home_model.created', 'home_models', new.id,
      null, to_jsonb(new), null
    );
  elsif tg_op = 'UPDATE' and (old.deleted_at is null and new.deleted_at is not null) then
    perform public.emit_audit(
      new.org_id, 'home_model.archived', 'home_models', new.id,
      jsonb_build_object('deleted_at', old.deleted_at),
      jsonb_build_object('deleted_at', new.deleted_at),
      null
    );
  end if;
  return new;
end;
$$;

create trigger home_models_audit_after
  after insert or update on public.home_models
  for each row execute function public.tg_home_models_audit();
