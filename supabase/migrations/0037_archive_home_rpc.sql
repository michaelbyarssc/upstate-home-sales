-- Archiving a home sets deleted_at to non-null, which makes the row
-- invisible to the homes_select_member policy (deleted_at is null).
-- PostgREST checks SELECT visibility on the new row during UPDATE,
-- causing an RLS error. This SECURITY DEFINER function bypasses that
-- while still enforcing org membership and role checks internally.

create or replace function public.archive_home(home_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.homes
  set status = 'archived', deleted_at = now()
  where id = home_id
    and deleted_at is null
    and org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[]);

  if not found then
    raise exception 'Home not found or insufficient permissions'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.archive_home(uuid) from public;
grant execute on function public.archive_home(uuid) to authenticated;
