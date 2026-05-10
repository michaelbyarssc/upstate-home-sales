-- ============================================================================
-- seed.sql
-- Idempotent seed for staging. Re-runs cleanly via `supabase db reset`.
--
-- Creates:
--   • One org: "Upstate Home Sales — Spartanburg"
--   • One active lot: Spartanburg
--   • One owner: MichaelByarsSC@gmail.com (also platform admin)
--
-- Note: legacy Lexington (UUID …0010) and Anderson (UUID …0011) lot rows
-- created by historical seeds are intentionally not removed here — they have
-- been soft-deleted in production via scripts/migrate-lexington-to-spartanburg.mjs
-- and won't appear in any active queries (UI filters deleted_at IS NULL).
--
-- The auth.users row is provisioned via the Supabase auth admin API at deploy
-- time; this script only links it up. If the user does not exist yet, the
-- DO block at the bottom no-ops with a NOTICE so seeding is non-fatal.
-- ============================================================================

insert into public.orgs (id, slug, name, brand_color, default_markup_pct)
values (
  '00000000-0000-0000-0000-000000000001',
  'uhs-spartanburg',
  'Upstate Home Sales — Spartanburg',
  '#B9532A',
  25.00
)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  brand_color = excluded.brand_color,
  default_markup_pct = excluded.default_markup_pct;

insert into public.lots (id, org_id, name, address)
values
  (
    'fe1448f2-0609-42f1-b7a9-48034fcd4a6b',
    '00000000-0000-0000-0000-000000000001',
    'Spartanburg',
    'Spartanburg, SC'
  )
on conflict (id) do update set
  name = excluded.name,
  address = excluded.address,
  deleted_at = null;

-- Link the first admin user. Must already exist in auth.users.
do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users
  where lower(email) = lower('MichaelByarsSC@gmail.com')
  limit 1;

  if v_user_id is null then
    raise notice
      'Seed: auth.users row for MichaelByarsSC@gmail.com not found. '
      'Create the user via Supabase Auth admin (or invite-user edge fn), '
      'then re-run seed.';
    return;
  end if;

  -- Owner of the seeded org.
  insert into public.org_members (user_id, org_id, role, status)
  values (v_user_id, '00000000-0000-0000-0000-000000000001', 'owner', 'active')
  on conflict (user_id, org_id) do update set
    role = excluded.role,
    status = excluded.status;

  -- Also a platform admin (per Q6 / user's instruction).
  insert into public.platform_admins (user_id, notes)
  values (v_user_id, 'Initial platform admin from seed')
  on conflict (user_id) do nothing;

  raise notice 'Seed: linked % as owner of uhs-spartanburg and platform admin', v_user_id;
end $$;
