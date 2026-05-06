-- ============================================================================
-- 0001_tenancy_auth.sql
-- Foundation: orgs, org_members, lots, role enum, helper functions, RLS.
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ─── Role enum ──────────────────────────────────────────────────────────────
create type public.role_enum as enum (
  'owner',     -- full access incl. billing
  'manager',   -- full ops, no billing/users
  'sales',     -- leads + quotes + read inventory
  'service',   -- service tickets + trade-ins
  'readonly'   -- read leads & inventory only
);

-- ─── orgs ───────────────────────────────────────────────────────────────────
create table public.orgs (
  id                  uuid primary key default uuid_generate_v4(),
  slug                text not null unique,
  name                text not null,
  brand_color         text,
  logo_url            text,
  default_markup_pct  numeric(5,2) not null default 25.00,
  -- Per-org SMS consent wording (Q3); each dealer's lawyer can edit theirs.
  sms_consent_text    text not null default
    'I agree to receive text messages from this dealer about my inquiry. '
    'Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
  status              text not null default 'active'
                      check (status in ('active', 'suspended', 'archived')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index orgs_status_idx on public.orgs (status);

-- ─── lots ───────────────────────────────────────────────────────────────────
create table public.lots (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  name        text not null,
  address     text,
  manager_id  uuid references auth.users(id) on delete set null,
  -- Soft-delete pattern (Q5b)
  deleted_at  timestamptz,
  deleted_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index lots_org_idx on public.lots (org_id) where deleted_at is null;
create index lots_deleted_idx on public.lots (deleted_at) where deleted_at is not null;

-- ─── org_members ────────────────────────────────────────────────────────────
create table public.org_members (
  user_id         uuid not null references auth.users(id) on delete cascade,
  org_id          uuid not null references public.orgs(id) on delete cascade,
  role            public.role_enum not null,
  scoped_lots     uuid[],
  status          text not null default 'active'
                  check (status in ('active', 'suspended', 'pending')),
  invited_by      uuid references auth.users(id),
  invited_at      timestamptz,
  last_active_at  timestamptz,
  created_at      timestamptz not null default now(),
  primary key (user_id, org_id)
);

create index org_members_user_idx on public.org_members (user_id) where status = 'active';
create index org_members_org_idx on public.org_members (org_id) where status = 'active';

-- ─── Helper functions ───────────────────────────────────────────────────────
-- Returns all orgs the calling user is an active member of.
-- Stable + security definer so RLS policies can call without recursion.
create or replace function public.org_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(array_agg(org_id), array[]::uuid[])
  from public.org_members
  where user_id = auth.uid() and status = 'active';
$$;

revoke all on function public.org_ids() from public;
grant execute on function public.org_ids() to authenticated;

-- Returns the org_id the client has marked active via the `x-active-org`
-- header. Validated against public.org_ids() in policies. Null if absent.
create or replace function public.active_org()
returns uuid
language plpgsql
stable
as $$
declare
  hdr text;
  oid uuid;
begin
  begin
    hdr := current_setting('request.headers', true)::json ->> 'x-active-org';
  exception when others then
    return null;
  end;
  if hdr is null or hdr = '' then return null; end if;
  begin
    oid := hdr::uuid;
  exception when others then
    return null;
  end;
  return oid;
end;
$$;

revoke all on function public.active_org() from public;
grant execute on function public.active_org() to authenticated;

-- Helper for role-gated policies.
create or replace function public.has_role_in(p_org uuid, p_roles public.role_enum[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.org_members
    where user_id = auth.uid()
      and org_id = p_org
      and status = 'active'
      and role = any(p_roles)
  );
$$;

revoke all on function public.has_role_in(uuid, public.role_enum[]) from public;
grant execute on function public.has_role_in(uuid, public.role_enum[]) to authenticated;

-- ─── RLS · orgs ─────────────────────────────────────────────────────────────
alter table public.orgs enable row level security;

create policy orgs_select_member on public.orgs
  for select
  using (id = any(public.org_ids()));

create policy orgs_update_owner on public.orgs
  for update
  using (public.has_role_in(id, array['owner']::public.role_enum[]))
  with check (public.has_role_in(id, array['owner']::public.role_enum[]));

-- Inserts/deletes on orgs are platform-admin only (handled via service role
-- in 0003). No anon/authenticated insert policy here.

-- ─── RLS · lots ─────────────────────────────────────────────────────────────
alter table public.lots enable row level security;

create policy lots_select_member on public.lots
  for select
  using (
    deleted_at is null
    and org_id = any(public.org_ids())
    and (public.active_org() is null or org_id = public.active_org())
  );

create policy lots_modify_manager on public.lots
  for all
  using (
    public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  )
  with check (
    public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  );

-- ─── RLS · org_members ──────────────────────────────────────────────────────
alter table public.org_members enable row level security;

-- A user can see their own memberships across orgs (powers the switcher).
create policy org_members_select_self on public.org_members
  for select
  using (user_id = auth.uid());

-- Owners and managers can see all memberships in orgs they're in.
create policy org_members_select_admins on public.org_members
  for select
  using (
    public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  );

-- Only owners can write to org_members (invite, role change, suspend).
create policy org_members_modify_owner on public.org_members
  for all
  using (public.has_role_in(org_id, array['owner']::public.role_enum[]))
  with check (public.has_role_in(org_id, array['owner']::public.role_enum[]));

-- ─── updated_at triggers ────────────────────────────────────────────────────
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger orgs_set_updated_at
  before update on public.orgs
  for each row execute function public.tg_set_updated_at();

create trigger lots_set_updated_at
  before update on public.lots
  for each row execute function public.tg_set_updated_at();
