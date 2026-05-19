-- Same RLS issue as homes: the home_models_select_member policy requires
-- deleted_at is null, so PostgREST blocks .update({ deleted_at: ... }).
-- This SECURITY DEFINER function bypasses that while enforcing auth internally.

create or replace function public.archive_model(model_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.home_models
  set deleted_at = now()
  where id = model_id
    and deleted_at is null
    and org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[]);

  if not found then
    raise exception 'Model not found or insufficient permissions'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.archive_model(uuid) from public;
grant execute on function public.archive_model(uuid) to authenticated;
