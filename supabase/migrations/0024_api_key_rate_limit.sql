-- ============================================================================
-- 0024_api_key_rate_limit.sql
-- PR 3.4 — per-key rate limit on the public v1 API.
--
-- Adds an integer `rate_limit_per_minute` column to org_api_keys (defaults
-- to 60 rpm). The validate_api_key RPC is amended to return the limit too,
-- so the public app's middleware can enforce it without a second roundtrip.
-- ============================================================================

alter table public.org_api_keys
  add column if not exists rate_limit_per_minute int not null default 60;

-- Replace the validate_api_key RPC to also surface the per-key limit.
-- The previous signature returned (org_id uuid, scopes text[]); we drop +
-- recreate so the column list changes cleanly.
drop function if exists public.validate_api_key(text);

create or replace function public.validate_api_key(p_key_hash text)
returns table (org_id uuid, scopes text[], rate_limit_per_minute int)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.org_api_keys
    set last_used_at = now()
    where key_hash = p_key_hash
      and revoked_at is null
    returning
      public.org_api_keys.org_id,
      public.org_api_keys.scopes,
      public.org_api_keys.rate_limit_per_minute;
end;
$$;

revoke all on function public.validate_api_key(text) from public, anon, authenticated;
-- service_role only.
