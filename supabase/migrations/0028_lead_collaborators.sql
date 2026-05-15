-- ─── Lead Collaborators ─────────────────────────────────────────────────────
-- Enables deal sharing between users (same-org and cross-org) with optional
-- commission split tracking.

create type public.collab_role as enum ('viewer', 'editor', 'split');

create table public.lead_collaborators (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.collab_role not null default 'editor',
  split_pct   numeric(5,2),
  added_by    uuid references auth.users(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now(),
  unique (lead_id, user_id)
);

create index lead_collaborators_user_idx on public.lead_collaborators (user_id);
create index lead_collaborators_lead_idx on public.lead_collaborators (lead_id);

-- ─── RLS · lead_collaborators ───────────────────────────────────────────────
alter table public.lead_collaborators enable row level security;

-- SELECT: you can see collaborator rows if you're the collaborator or in the lead's org
create policy lead_collaborators_select on public.lead_collaborators
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.leads l
      where l.id = lead_id
        and l.org_id = any(public.org_ids())
    )
  );

-- INSERT/UPDATE/DELETE: only org owners/managers/sales on the lead's org
create policy lead_collaborators_modify on public.lead_collaborators
  for all to authenticated
  using (
    exists (
      select 1 from public.leads l
      where l.id = lead_id
        and l.org_id = any(public.org_ids())
        and public.has_role_in(l.org_id, array['owner','manager','sales']::public.role_enum[])
    )
  )
  with check (
    exists (
      select 1 from public.leads l
      where l.id = lead_id
        and l.org_id = any(public.org_ids())
        and public.has_role_in(l.org_id, array['owner','manager','sales']::public.role_enum[])
    )
  );

-- ─── Update leads RLS to include collaborators ──────────────────────────────

-- SELECT: org member OR collaborator (shared leads bypass active_org filter)
drop policy leads_select_member on public.leads;
create policy leads_select_member on public.leads
  for select to authenticated
  using (
    (
      org_id = any(public.org_ids())
      and (public.active_org() is null or org_id = public.active_org())
    )
    or
    id in (select lead_id from public.lead_collaborators where user_id = auth.uid())
  );

-- UPDATE: org member with sales+ role OR collaborator with editor/split role
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

-- ─── Update lead_messages RLS to include collaborators ──────────────────────

-- SELECT: org member OR collaborator
drop policy lead_messages_select_member on public.lead_messages;
create policy lead_messages_select_member on public.lead_messages
  for select to authenticated
  using (
    (
      org_id = any(public.org_ids())
      and (public.active_org() is null or org_id = public.active_org())
    )
    or
    lead_id in (select lead_id from public.lead_collaborators where user_id = auth.uid())
  );

-- INSERT: org member with sales+ role OR collaborator with editor/split role
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

-- ─── Realtime ───────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.lead_collaborators;
