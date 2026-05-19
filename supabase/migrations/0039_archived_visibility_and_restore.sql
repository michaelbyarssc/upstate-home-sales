-- Allow owner/manager roles to SELECT archived rows in homes and home_models.
-- Postgres ORs multiple SELECT policies, so this works alongside the existing
-- *_select_member policies (which require deleted_at is null).
-- Public site is unaffected: public_homes view has its own deleted_at is null WHERE,
-- and anon has no policies on these tables.

create policy homes_select_archived on public.homes
  for select to authenticated
  using (
    deleted_at is not null
    and org_id = any(public.org_ids())
    and (public.active_org() is null or org_id = public.active_org())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  );

create policy home_models_select_archived on public.home_models
  for select to authenticated
  using (
    deleted_at is not null
    and org_id = any(public.org_ids())
    and (public.active_org() is null or org_id = public.active_org())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  );

-- Restore RPCs — SECURITY DEFINER because the UPDATE policies require
-- deleted_at is null in USING, blocking direct updates to archived rows.

create or replace function public.restore_home(home_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.homes
  set deleted_at = null,
      deleted_by = null,
      status = 'draft'
  where id = home_id
    and deleted_at is not null
    and org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[]);

  if not found then
    raise exception 'Home not found or insufficient permissions'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.restore_home(uuid) from public;
grant execute on function public.restore_home(uuid) to authenticated;

create or replace function public.restore_model(model_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.home_models
  set deleted_at = null,
      deleted_by = null
  where id = model_id
    and deleted_at is not null
    and org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[]);

  if not found then
    raise exception 'Model not found or insufficient permissions'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.restore_model(uuid) from public;
grant execute on function public.restore_model(uuid) to authenticated;
