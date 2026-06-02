-- ============================================================================
-- 0042_lead_assigned_homes.sql
-- Multi-home assignment. A lead can have several homes "assigned" (shortlisted)
-- from the inventory matcher, each optionally linked to the draft quote that was
-- auto-created on assignment. This supersedes the single scalar leads.home_id,
-- which is KEPT as the lead's "primary" home (used by the lead list / kanban and
-- as the default home for the quote/invoice/PO modals).
--
-- Conventions mirror 0007_leads.sql / 0041_lead_preferences.sql: org_id FK +
-- cascade, RLS via public.org_ids()/has_role_in()/active_org(). assigned_by
-- defaults to the acting user (auth.uid()).
-- ============================================================================

create table public.lead_assigned_homes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id)  on delete cascade,
  lead_id     uuid not null references public.leads(id) on delete cascade,
  home_id     uuid not null references public.homes(id) on delete cascade,
  -- Draft quote auto-created when the home was assigned (null if creation failed
  -- or the row was backfilled). `set null` so deleting the quote keeps the
  -- assignment intact.
  quote_id    uuid references public.quotes(id) on delete set null,
  assigned_by uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),

  unique (lead_id, home_id)
);

create index lead_assigned_homes_lead_idx on public.lead_assigned_homes (lead_id);
create index lead_assigned_homes_org_idx  on public.lead_assigned_homes (org_id);

-- ─── RLS (mirrors lead_preferences) ──────────────────────────────────────────
alter table public.lead_assigned_homes enable row level security;

-- Read: any active org member.
create policy lead_assigned_homes_select_member on public.lead_assigned_homes
  for select to authenticated
  using (
    org_id = any(public.org_ids())
    and (public.active_org() is null or org_id = public.active_org())
  );

-- Insert/Update/Delete: sales+ (matches quotes_modify_member).
create policy lead_assigned_homes_modify_member on public.lead_assigned_homes
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  );

-- ─── Backfill existing single assignments ────────────────────────────────────
-- Every lead that already points at a home becomes its first assigned home.
insert into public.lead_assigned_homes (org_id, lead_id, home_id)
select org_id, id, home_id
from public.leads
where home_id is not null
on conflict (lead_id, home_id) do nothing;
