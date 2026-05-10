-- ============================================================================
-- 0014_collections.sql
-- Phase B.7: home collections (curated landing pages).
--
-- A collection groups homes for a marketing reason — "Under $100k", "Single-
-- wides for first-time buyers", "New arrivals" — with its own slug-routed
-- landing page, hero image, and sort order. Homes can belong to multiple
-- collections at once via a junction table.
-- ============================================================================

create table public.home_collections (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  slug              text not null,
  name              text not null,
  description       text,
  -- Storage path in the home-photos bucket (reused, with a "collections/" prefix
  -- per upload convention). Optional — falls back to the first home's photo.
  hero_storage_path text,
  sort_order        int not null default 0,
  is_published      boolean not null default true,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (org_id, slug)
);

create index home_collections_org_idx on public.home_collections (org_id, sort_order, name);
create index home_collections_published_idx on public.home_collections (is_published, sort_order)
  where is_published = true;

create trigger home_collections_set_updated_at
  before update on public.home_collections
  for each row execute function public.tg_set_updated_at();

create table public.home_collection_members (
  collection_id  uuid not null references public.home_collections(id) on delete cascade,
  home_id        uuid not null references public.homes(id) on delete cascade,
  org_id         uuid not null references public.orgs(id) on delete cascade,
  sort_order     int not null default 0,
  added_at       timestamptz not null default now(),
  primary key (collection_id, home_id)
);

create index home_collection_members_collection_idx
  on public.home_collection_members (collection_id, sort_order);
create index home_collection_members_home_idx
  on public.home_collection_members (home_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.home_collections enable row level security;
alter table public.home_collection_members enable row level security;

create policy home_collections_select_member on public.home_collections
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy home_collections_modify_managers on public.home_collections
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

create policy home_collection_members_select_member on public.home_collection_members
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy home_collection_members_modify_managers on public.home_collection_members
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- ─── Public read: only published collections from active orgs ───────────────
create view public.public_collections as
select
  c.id,
  c.org_id,
  c.slug,
  c.name,
  c.description,
  c.hero_storage_path,
  c.sort_order,
  c.created_at
from public.home_collections c
join public.orgs o on o.id = c.org_id
where c.is_published = true
  and o.status = 'active';

create view public.public_collection_members as
select
  m.collection_id,
  m.home_id,
  m.sort_order
from public.home_collection_members m
join public.home_collections c on c.id = m.collection_id
join public.homes h on h.id = m.home_id
where c.is_published = true
  and h.status = 'published'
  and h.deleted_at is null
  and h.hide_from_search = false;

grant select on public.public_collections to anon, authenticated;
grant select on public.public_collection_members to anon, authenticated;
