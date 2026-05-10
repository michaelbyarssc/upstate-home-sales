-- ============================================================================
-- 0021_api_marketplace.sql
-- Phase I: public API keys + cross-dealer marketplace.
--
-- Adds:
--   - org_api_keys: SHA-256 hashed API keys for the public read-only API,
--     with per-key scopes and revocation.
--   - homes.marketplace_opt_in: boolean flag dealers set per home to share
--     listings on the cross-dealer marketplace at /marketplace.
--   - public_marketplace_homes: anon view that joins public_homes with org
--     metadata (name, slug, logo) for the marketplace browse experience.
--   - validate_api_key RPC: looks up + validates a key by hash, returns
--     org_id + scopes. Used by the public API rate-limit + auth middleware.
-- ============================================================================

-- ─── org_api_keys ──────────────────────────────────────────────────────────
create table public.org_api_keys (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  -- SHA-256 hex of the actual key. The plaintext is shown once at creation.
  key_hash        text not null unique,
  -- Friendly label so the dealer remembers what this key is for.
  name            text not null,
  -- Per-key scopes. Currently 'read:inventory' and 'read:models'; expand
  -- as more endpoints come online.
  scopes          text[] not null default array['read:inventory']::text[],
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz,
  revoked_at      timestamptz,
  revoked_by      uuid references auth.users(id) on delete set null
);

create index org_api_keys_org_idx on public.org_api_keys (org_id) where revoked_at is null;
create index org_api_keys_hash_idx on public.org_api_keys (key_hash) where revoked_at is null;

alter table public.org_api_keys enable row level security;

create policy org_api_keys_select_member on public.org_api_keys
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy org_api_keys_modify_managers on public.org_api_keys
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- ─── validate_api_key RPC ─────────────────────────────────────────────────
-- Public API middleware calls this with the SHA-256 hex of the supplied
-- bearer token. Returns org_id + scopes if valid + not revoked, NULL row
-- otherwise. Bumps last_used_at as a side effect.
create or replace function public.validate_api_key(p_key_hash text)
returns table (org_id uuid, scopes text[])
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
    returning public.org_api_keys.org_id, public.org_api_keys.scopes;
end;
$$;

revoke all on function public.validate_api_key(text) from public, anon, authenticated;
-- service_role only — called from the public API's middleware.

-- ─── homes.marketplace_opt_in ─────────────────────────────────────────────
alter table public.homes
  add column if not exists marketplace_opt_in boolean not null default false;

create index if not exists homes_marketplace_idx
  on public.homes (marketplace_opt_in, status)
  where marketplace_opt_in = true and status = 'published' and deleted_at is null;

-- ─── public_marketplace_homes view ─────────────────────────────────────────
-- Cross-dealer browse. Joins public_homes with org metadata so the
-- marketplace can show the dealer name + slug + logo on each card. Same
-- price-masking semantics as public_homes (prices_hidden respected).
create view public.public_marketplace_homes as
select
  h.id,
  h.org_id,
  h.stock_no,
  h.name,
  h.model,
  h.type,
  h.beds,
  h.baths,
  h.sqft,
  h.width_ft,
  h.length_ft,
  h.year_built,
  h.construction,
  case when o.prices_hidden then null else h.listed_price_cents end as listed_price_cents,
  o.prices_hidden,
  h.starting_from,
  h.headline,
  h.description,
  h.on_lot_since,
  h.is_featured,
  h.created_at,
  -- Dealer metadata for the marketplace cards.
  o.slug         as org_slug,
  o.name         as org_name,
  o.logo_url     as org_logo_url,
  o.brand_color  as org_brand_color
from public.homes h
join public.orgs o on o.id = h.org_id
where h.status = 'published'
  and h.deleted_at is null
  and h.hide_from_search = false
  and h.marketplace_opt_in = true
  and o.status = 'active';

grant select on public.public_marketplace_homes to anon, authenticated;

-- ─── marketplace_views ─────────────────────────────────────────────────────
-- Track per-home views from the marketplace so the listing org can see
-- attribution back to the cross-dealer browse.
create table public.marketplace_views (
  id              uuid primary key default gen_random_uuid(),
  home_id         uuid not null references public.homes(id) on delete cascade,
  -- Anonymous browser session id from the marketplace cookie.
  viewer_session_id text,
  viewer_ip_city  text,
  viewer_ip_region text,
  viewer_ip_country text,
  occurred_at     timestamptz not null default now()
);

create index marketplace_views_home_idx on public.marketplace_views (home_id, occurred_at desc);

alter table public.marketplace_views enable row level security;

-- Inserts via service role from the marketplace site. Reads via the home's
-- org members (so dealers can see how often their listings get marketplace impressions).
create policy marketplace_views_select_org on public.marketplace_views
  for select to authenticated
  using (
    exists (
      select 1 from public.homes h
      where h.id = marketplace_views.home_id
        and h.org_id = any(public.org_ids())
    )
  );

-- ─── Audit trigger ────────────────────────────────────────────────────────
create or replace function public.tg_audit_org_api_keys()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_audit(
      new.org_id, 'api_key.created', 'org_api_keys', new.id,
      null, jsonb_build_object('name', new.name, 'scopes', new.scopes), null
    );
    return new;
  end if;
  if tg_op = 'UPDATE' and new.revoked_at is distinct from old.revoked_at and new.revoked_at is not null then
    perform public.emit_audit(
      new.org_id, 'api_key.revoked', 'org_api_keys', new.id,
      jsonb_build_object('name', old.name), null, null
    );
    return new;
  end if;
  return new;
end;
$$;

create trigger org_api_keys_audit
  after insert or update on public.org_api_keys
  for each row execute function public.tg_audit_org_api_keys();
