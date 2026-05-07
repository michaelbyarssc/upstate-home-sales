-- ============================================================================
-- 0004_inventory.sql
-- Week 2: manufacturers, homes, home_photos. The markup model is enforced at
-- the database (generated column + role-gated trigger on pricing fields), and
-- the public_homes view is the ONLY surface anon may read.
-- ============================================================================

-- ─── Status / type enums ────────────────────────────────────────────────────
create type public.home_status as enum (
  'draft',
  'published',
  'hold',
  'sold',
  'archived'
);

create type public.home_type as enum (
  'single',
  'double',
  'modular'
);

-- ─── manufacturers (global, not tenant-scoped) ──────────────────────────────
create table public.manufacturers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique,
  logo_url    text,
  created_at  timestamptz not null default now()
);

alter table public.manufacturers enable row level security;

-- Anyone (anon + authenticated) can read manufacturers — they're a global
-- canonical list shown on the public site and admin form.
create policy manufacturers_select_all on public.manufacturers
  for select to anon, authenticated using (true);

-- Writes are platform-admin only (handled via service role).
grant select on public.manufacturers to anon, authenticated;

-- Seed the common SC dealer manufacturers.
insert into public.manufacturers (name, slug) values
  ('Clayton Built',  'clayton-built'),
  ('Champion',       'champion'),
  ('Cavco',          'cavco'),
  ('Live Oak',       'live-oak'),
  ('Franklin',       'franklin'),
  ('Deer Valley',    'deer-valley'),
  ('Skyline',        'skyline'),
  ('TruMH',          'trumh')
on conflict (slug) do nothing;

-- ─── homes ──────────────────────────────────────────────────────────────────
create table public.homes (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.orgs(id) on delete cascade,
  lot_id                   uuid references public.lots(id) on delete set null,

  stock_no                 text not null,
  name                     text not null,
  manufacturer_id          uuid references public.manufacturers(id),
  model                    text,
  type                     public.home_type not null default 'double',

  -- Specs
  beds                     int,
  baths                    numeric(3,1),
  sqft                     int,
  width_ft                 int,
  length_ft                int,
  year_built               int,
  construction             text,

  -- Pricing (🔒 internal — never exposed via anon)
  base_price_cents         bigint not null default 0,
  markup_pct               numeric(5,2) not null default 0,
  addons_cents             bigint not null default 0,
  setup_cents              bigint not null default 0,
  include_setup_in_price   boolean not null default true,
  starting_from            boolean not null default false,

  -- Generated public price. Postgres computes this; the client cannot drift.
  listed_price_cents       bigint generated always as (
    ((base_price_cents::numeric * (100 + markup_pct))::bigint / 100)
    + addons_cents
    + (case when include_setup_in_price then setup_cents else 0 end)
  ) stored,

  -- Public copy
  headline                 text,
  description              text,

  -- State
  status                   public.home_status not null default 'draft',
  on_lot_since             date,
  is_featured              boolean not null default false,
  hide_from_search         boolean not null default false,

  -- Audit / soft-delete
  created_by               uuid references auth.users(id),
  updated_by               uuid references auth.users(id),
  deleted_at               timestamptz,
  deleted_by               uuid references auth.users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint homes_stock_no_unique_per_org unique (org_id, stock_no)
);

create index homes_org_status_idx
  on public.homes (org_id, status) where deleted_at is null;
create index homes_org_lot_idx
  on public.homes (org_id, lot_id) where deleted_at is null;
create index homes_published_idx
  on public.homes (status, on_lot_since desc) where status = 'published' and deleted_at is null;
create index homes_search_idx
  on public.homes using gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(model,'') || ' ' || coalesce(headline,'') || ' ' || coalesce(description,'')));

-- ─── home_photos ────────────────────────────────────────────────────────────
create table public.home_photos (
  id            uuid primary key default gen_random_uuid(),
  home_id       uuid not null references public.homes(id) on delete cascade,
  org_id        uuid not null references public.orgs(id) on delete cascade,
  storage_path  text not null,
  sort_order    int not null default 0,
  alt_text      text,
  width         int,
  height        int,
  created_at    timestamptz not null default now()
);

create index home_photos_home_idx on public.home_photos (home_id, sort_order);
create index home_photos_org_idx on public.home_photos (org_id);

-- ─── public_homes view (the ONLY anon-readable surface) ─────────────────────
-- Stripped of base_price_cents and markup_pct so they can never reach the
-- public anon key. Only published, non-deleted rows are exposed.
create view public.public_homes
with (security_invoker = on) as
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

-- View of public photos (joined to published homes).
create view public.public_home_photos
with (security_invoker = on) as
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

-- ─── RLS: homes ─────────────────────────────────────────────────────────────
alter table public.homes enable row level security;

-- Authenticated members of the org can read non-deleted homes,
-- narrowed to active-org and (if applicable) scoped_lots.
create policy homes_select_member on public.homes
  for select to authenticated
  using (
    deleted_at is null
    and org_id = any(public.org_ids())
    and (public.active_org() is null or org_id = public.active_org())
    and (
      not exists (
        select 1 from public.org_members m
        where m.user_id = auth.uid()
          and m.org_id = homes.org_id
          and m.scoped_lots is not null
          and array_length(m.scoped_lots, 1) > 0
      )
      or lot_id in (
        select unnest(scoped_lots) from public.org_members
        where user_id = auth.uid() and org_id = homes.org_id
      )
    )
  );

-- Insert: any active member with sales+ role.
create policy homes_insert_member on public.homes
  for insert to authenticated
  with check (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  );

-- Update: any active member with sales+ role (pricing-field gating handled
-- by the trigger below — RLS can't compare OLD vs NEW).
create policy homes_update_member on public.homes
  for update to authenticated
  using (
    deleted_at is null
    and org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (
    org_id = any(public.org_ids())
  );

-- Delete is soft (status='archived' + deleted_at). Hard delete is owner-only.
create policy homes_delete_owner on public.homes
  for delete to authenticated
  using (public.has_role_in(org_id, array['owner']::public.role_enum[]));

-- ─── Pricing-field role gate (trigger, since RLS can't see OLD/NEW) ─────────
create or replace function public.tg_homes_pricing_role()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (
       new.base_price_cents       is distinct from old.base_price_cents
    or new.markup_pct             is distinct from old.markup_pct
    or new.addons_cents           is distinct from old.addons_cents
    or new.setup_cents            is distinct from old.setup_cents
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

create trigger homes_pricing_role_check
  before update on public.homes
  for each row execute function public.tg_homes_pricing_role();

-- ─── updated_at + audit emitter for pricing changes ─────────────────────────
create trigger homes_set_updated_at
  before update on public.homes
  for each row execute function public.tg_set_updated_at();

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
        or new.setup_cents is distinct from old.setup_cents) then
      perform public.emit_audit(
        new.org_id, 'home.pricing.changed', 'homes', new.id,
        jsonb_build_object(
          'base_price_cents', old.base_price_cents,
          'markup_pct', old.markup_pct,
          'addons_cents', old.addons_cents,
          'setup_cents', old.setup_cents,
          'listed_price_cents', old.listed_price_cents
        ),
        jsonb_build_object(
          'base_price_cents', new.base_price_cents,
          'markup_pct', new.markup_pct,
          'addons_cents', new.addons_cents,
          'setup_cents', new.setup_cents,
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

create trigger homes_audit_after
  after insert or update on public.homes
  for each row execute function public.tg_homes_audit();

-- Auto-fill created_by / updated_by from auth.uid().
create or replace function public.tg_homes_actor()
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

create trigger homes_actor
  before insert or update on public.homes
  for each row execute function public.tg_homes_actor();

-- ─── RLS: home_photos ───────────────────────────────────────────────────────
alter table public.home_photos enable row level security;

create policy home_photos_select_member on public.home_photos
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy home_photos_modify_member on public.home_photos
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  );

-- ─── Anon access to the public views ────────────────────────────────────────
-- Anon NEVER gets select on the homes table itself.
revoke all on public.homes from anon;
revoke all on public.home_photos from anon;

grant select on public.public_homes to anon, authenticated;
grant select on public.public_home_photos to anon, authenticated;

-- ─── Seed inventory for the Lexington org so the UI has data ────────────────
do $$
declare
  v_org      constant uuid := '00000000-0000-0000-0000-000000000001';
  v_lot_lex  constant uuid := '00000000-0000-0000-0000-000000000010';
  v_lot_and  constant uuid := '00000000-0000-0000-0000-000000000011';
  v_clayton  uuid;
  v_champ    uuid;
  v_cavco    uuid;
  v_liveoak  uuid;
begin
  if not exists (select 1 from public.orgs where id = v_org) then
    raise notice 'Seed inventory: org % not present, skipping', v_org;
    return;
  end if;

  select id into v_clayton from public.manufacturers where slug='clayton-built';
  select id into v_champ   from public.manufacturers where slug='champion';
  select id into v_cavco   from public.manufacturers where slug='cavco';
  select id into v_liveoak from public.manufacturers where slug='live-oak';

  insert into public.homes (org_id, lot_id, stock_no, name, manufacturer_id, model, type, beds, baths, sqft, width_ft, length_ft, year_built, base_price_cents, markup_pct, addons_cents, setup_cents, status, on_lot_since, headline, description)
  values
    (v_org, v_lot_lex, 'UH-1434-AS', '1434 Southern Belle',  v_clayton, 'The Aspect',  'double', 3, 2.0, 1813, 32, 56, 2024, 12900000, 15.00, 450000, 680000, 'published', current_date - 42, 'A 3-bed, 2-bath Clayton Built with the kitchen island you''ll actually use', 'Built on the popular Aspect floor plan, this home opens to a 14-ft kitchen with quartz tops, a deep apron-front sink, and the kind of pantry that swallows a Costco run whole. The primary suite sits on the back of the home for quiet, with a walk-in tile shower and double vanity.'),
    (v_org, v_lot_lex, 'UH-2106-AT', '2106 Magnolia Ridge',  v_champ,   'Athens 2864', 'double', 4, 2.0, 2128, 28, 76, 2024, 16000000, 15.00, 320000, 720000, 'published', current_date - 11, 'Four bedrooms, two baths, and a porch swing waiting on the front', 'The Athens 2864 is the family home that grows with you. Open plan, large laundry, and an oversized primary suite.'),
    (v_org, v_lot_lex, 'UH-3201-CR', '3201 Pine Grove',      v_cavco,   'The Carolina','double', 3, 2.0, 1560, 28, 56, 2023, 11548000, 15.00, 250000, 680000, 'published', current_date - 67, 'Smart layout, big windows, and a price that makes sense', 'A practical 3-bed double-wide with energy-efficient windows and a generous primary closet.'),
    (v_org, v_lot_and, 'UH-0817-HR', '817 Riverbend',        v_clayton, 'The Heritage','single', 2, 2.0, 1140, 16, 72, 2024, 9780000,  15.00, 200000, 580000, 'published', current_date - 8,  'Compact, modern, and ready to move into', 'A right-sized 2-bed single-wide with vaulted ceilings and a step-up shower.'),
    (v_org, v_lot_and, 'UH-1209-MG', '1209 Old Forest Lane', v_liveoak, 'The Magnolia','double', 4, 3.0, 2432, 32, 76, 2024, 18800000, 15.00, 580000, 720000, 'draft',     current_date,       'Four beds, three baths, and a kitchen built for company', 'The Magnolia is the upscale option in the Live Oak line — quartz throughout, double vanities, and a walk-in pantry.')
  on conflict (org_id, stock_no) do nothing;
end $$;
