-- Fix circular RLS dependency: leads policy references lead_collaborators,
-- and lead_collaborators policy references leads. Postgres blocks this by
-- returning no rows from the inner query, making all leads invisible.
--
-- Solution: create a security-definer function that reads lead_collaborators
-- bypassing RLS, then use it in the leads/lead_messages policies.

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

-- Also simplify lead_collaborators SELECT policy to avoid querying leads table.
-- Users can see rows where they are the collaborator OR they belong to the same org.
drop policy lead_collaborators_select on public.lead_collaborators;
create policy lead_collaborators_select on public.lead_collaborators
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.org_members om
      join public.leads l on l.org_id = om.org_id
      where om.user_id = auth.uid()
        and om.status = 'active'
        and l.id = lead_collaborators.lead_id
    )
  );

-- Recreate leads SELECT policy using the helper function
drop policy leads_select_member on public.leads;
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

-- Recreate leads UPDATE policy using the helper function
drop policy leads_update_member on public.leads;
create policy leads_update_member on public.leads
  for update to authenticated
  using (
    (
      org_id = any(public.org_ids())
      and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
    )
    or
    id in (
      select lead_id from public.lead_collaborators
      where user_id = auth.uid() and role in ('editor', 'split')
    )
  )
  with check (true);

-- Recreate lead_messages SELECT policy using the helper function
drop policy lead_messages_select_member on public.lead_messages;
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

-- Recreate lead_messages INSERT policy using the helper function
drop policy lead_messages_insert_member on public.lead_messages;
create policy lead_messages_insert_member on public.lead_messages
  for insert to authenticated
  with check (
    (
      org_id = any(public.org_ids())
      and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
    )
    or
    lead_id in (
      select lead_id from public.lead_collaborators
      where user_id = auth.uid() and role in ('editor', 'split')
    )
  );
