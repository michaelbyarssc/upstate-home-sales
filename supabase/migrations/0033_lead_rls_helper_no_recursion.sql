-- ─────────────────────────────────────────────────────────────────────────────
-- 0033_lead_rls_helper_no_recursion.sql
--
-- Migration 0029 fixed the original collaborator recursion by adding the
-- security-definer `collab_lead_ids()` helper and using it in the leads /
-- lead_messages SELECT policies. But the `lead_collaborators_select` and
-- `lead_collaborators_modify` policies still query `leads` directly via
-- `EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id ...)`. That
-- triggers `leads_select_member`, which is fine IN ISOLATION, but combined
-- with new policies that query lead_collaborators (e.g. from
-- lead_messages_insert_member), Postgres still flags an infinite-recursion
-- chain when running the planner against certain row combinations.
--
-- The robust fix: route every "what org does this lead belong to?" lookup
-- through a single security-definer function. Then RLS policies never have
-- to call the table they're protecting (directly or transitively).
-- ─────────────────────────────────────────────────────────────────────────────

-- Defensive: recreate collab_lead_ids() (originally from 0029) so this
-- migration is independent of 0029's state.
create or replace function public.collab_lead_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select lead_id from public.lead_collaborators where user_id = auth.uid();
$$;

grant execute on function public.collab_lead_ids() to authenticated;

-- Returns the org_id for a given lead, bypassing RLS via SECURITY DEFINER.
create or replace function public.lead_org_id(p_lead_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select org_id from public.leads where id = p_lead_id;
$$;

grant execute on function public.lead_org_id(uuid) to authenticated;

-- ── lead_collaborators ───────────────────────────────────────────────────────
drop policy if exists lead_collaborators_select on public.lead_collaborators;
create policy lead_collaborators_select on public.lead_collaborators
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.lead_org_id(lead_id) = any(public.org_ids())
  );

drop policy if exists lead_collaborators_modify on public.lead_collaborators;
create policy lead_collaborators_modify on public.lead_collaborators
  for all to authenticated
  using (
    public.has_role_in(
      public.lead_org_id(lead_id),
      array['owner','manager','sales']::public.role_enum[]
    )
  )
  with check (
    public.has_role_in(
      public.lead_org_id(lead_id),
      array['owner','manager','sales']::public.role_enum[]
    )
  );

-- ── leads ────────────────────────────────────────────────────────────────────
-- Recreate to make sure the production policy matches the helper-based shape
-- regardless of what state 0029 left things in.
drop policy if exists leads_select_member on public.leads;
create policy leads_select_member on public.leads
  for select to authenticated
  using (
    (
      org_id = any(public.org_ids())
      and (public.active_org() is null or org_id = public.active_org())
    )
    or
    id in (select public.collab_lead_ids())
  );

drop policy if exists leads_update_member on public.leads;
create policy leads_update_member on public.leads
  for update to authenticated
  using (
    (
      org_id = any(public.org_ids())
      and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
    )
    or
    id in (select public.collab_lead_ids())
  )
  with check (true);

-- ── lead_messages ────────────────────────────────────────────────────────────
-- Use the helper for the collaborator branch so the WITH CHECK on INSERT
-- doesn't trigger lead_collaborators RLS at all.
drop policy if exists lead_messages_select_member on public.lead_messages;
create policy lead_messages_select_member on public.lead_messages
  for select to authenticated
  using (
    (
      org_id = any(public.org_ids())
      and (public.active_org() is null or org_id = public.active_org())
    )
    or
    lead_id in (select public.collab_lead_ids())
  );

drop policy if exists lead_messages_insert_member on public.lead_messages;
create policy lead_messages_insert_member on public.lead_messages
  for insert to authenticated
  with check (
    (
      org_id = any(public.org_ids())
      and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
    )
    or
    lead_id in (select public.collab_lead_ids())
  );
