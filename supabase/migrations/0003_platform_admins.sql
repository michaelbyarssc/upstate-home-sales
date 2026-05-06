-- ============================================================================
-- 0003_platform_admins.sql
-- Platform-operator access (Q6). Kept entirely outside org_members so a
-- compromised platform-admin JWT doesn't masquerade as a member of any org.
-- Platform admins access tenant data via the service role + an internal
-- support tool, NOT via standard RLS read policies.
-- ============================================================================

create table public.platform_admins (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  granted_by   uuid references auth.users(id),
  granted_at   timestamptz not null default now(),
  notes        text
);

alter table public.platform_admins enable row level security;

-- A platform admin can see their own row (so the admin app can detect the
-- privilege and surface a support menu). No one else can read this table
-- via RLS — modifications happen via service role only.
create policy platform_admins_select_self on public.platform_admins
  for select
  using (user_id = auth.uid());

-- Helper: is the current user a platform admin?
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;
