-- ============================================================================
-- 0017_parcels_diy.sql
-- Phase E.2: free DIY parcel-data provider via PostGIS + per-county GeoJSON.
--
-- We import each SC county's free public-records parcel shapefile (or GeoJSON
-- from Local Gradient bulk download) into the `parcels` table. The DIY
-- provider in apps/admin/lib/parcels/index.ts then geocodes a buyer-supplied
-- address (Google Maps geocoder) and runs a point-in-polygon query against
-- this table to find the matching parcel — zero per-call cost.
--
-- This migration only sets up the infrastructure. Per-county data is loaded
-- via apps/admin/scripts/import-parcels.ts (one run per county GeoJSON file).
-- ============================================================================

-- ─── PostGIS ───────────────────────────────────────────────────────────────
-- Enables geometry types + spatial indexes + ST_Contains etc. Idempotent.
create extension if not exists postgis;

-- ─── parcels ───────────────────────────────────────────────────────────────
-- Public records data; not org-scoped (every dealer in SC can hit the same
-- parcel rows). We don't use RLS here — the data is non-sensitive and any
-- authenticated user can read.
create table public.parcels (
  id              uuid primary key default gen_random_uuid(),
  -- County's parcel identifier (PIN/APN/parcelnumb depending on county).
  parcel_id       text not null,
  state           text not null default 'SC' check (length(state) = 2),
  county          text not null,
  address         text,
  city            text,
  zip             text,
  -- Parcel polygon as PostGIS geometry; stored in WGS84 (SRID 4326) for
  -- direct compatibility with GeoJSON lat/lng coordinates from Google Maps.
  geom            geometry(MultiPolygon, 4326) not null,
  -- Pre-computed centroid so the lookup result doesn't need ST_Centroid every call.
  centroid_lat    double precision not null,
  centroid_lng    double precision not null,
  -- Original record from the county shapefile/GeoJSON (sqft, owner, etc.).
  -- Searchable but not indexed; we only project the relevant fields.
  raw_props       jsonb,
  -- Provenance: where did this row come from (county portal URL, LG bulk file).
  source          text,
  imported_at     timestamptz not null default now(),
  -- One parcel per (county, parcel_id) — re-imports of the same county
  -- upsert via this constraint.
  unique (county, parcel_id, state)
);

create index parcels_county_idx on public.parcels (state, county);
create index parcels_address_idx on public.parcels (lower(address)) where address is not null;
-- Spatial index — enables sub-millisecond ST_Contains lookups even across
-- millions of parcels. GiST is the right index type for geometry columns.
create index parcels_geom_idx on public.parcels using gist (geom);

alter table public.parcels enable row level security;

-- Public records: any signed-in user reads. Service role writes (via the
-- importer script). No anon read — keeps the per-row cost outside the
-- public site's anon quota.
create policy parcels_select_authed on public.parcels
  for select to authenticated
  using (true);

-- ─── parcel_imports ────────────────────────────────────────────────────────
-- Audit + admin visibility for which counties have been loaded and when.
create table public.parcel_imports (
  id              uuid primary key default gen_random_uuid(),
  state           text not null default 'SC',
  county          text not null,
  source          text not null,
  feature_count   int not null,
  imported_by     uuid references auth.users(id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now()
);

create index parcel_imports_county_idx on public.parcel_imports (state, county, created_at desc);

alter table public.parcel_imports enable row level security;

-- Platform admins + org owners/managers can see import history. Anyone
-- authenticated can confirm coverage for their own dealers.
create policy parcel_imports_select_authed on public.parcel_imports
  for select to authenticated
  using (true);

-- ─── lookup_parcel_by_point: typed RPC for the DIY provider ────────────────
-- Takes geocoded lat/lng, returns the matching parcel's polygon as GeoJSON
-- + centroid + address. Wrapped in an SQL function so the app code doesn't
-- need to know about ST_* functions.
create or replace function public.lookup_parcel_by_point(p_lat double precision, p_lng double precision)
returns table (
  parcel_id     text,
  state         text,
  county        text,
  address       text,
  geojson       jsonb,
  centroid_lat  double precision,
  centroid_lng  double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.parcel_id,
    p.state,
    p.county,
    p.address,
    ST_AsGeoJSON(p.geom)::jsonb as geojson,
    p.centroid_lat,
    p.centroid_lng
  from public.parcels p
  where ST_Contains(p.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  limit 1;
$$;

revoke all on function public.lookup_parcel_by_point(double precision, double precision) from public;
grant execute on function public.lookup_parcel_by_point(double precision, double precision) to authenticated;

-- ─── upsert_parcels_batch: bulk loader RPC ─────────────────────────────────
-- The JS supabase-js client can't send PostGIS geometry directly. Workflow:
-- the importer script serializes each parcel's geometry as a GeoJSON string,
-- batches up to ~500 rows per call, and invokes this function. PostgreSQL
-- runs ST_GeomFromGeoJSON server-side and upserts on (county, parcel_id, state).
--
-- Service role only — county imports are an admin operation, never run from
-- a user-facing route.
create or replace function public.upsert_parcels_batch(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_row jsonb;
begin
  for v_row in select * from jsonb_array_elements(p_rows) loop
    insert into public.parcels (
      parcel_id,
      state,
      county,
      address,
      city,
      zip,
      geom,
      centroid_lat,
      centroid_lng,
      raw_props,
      source
    )
    values (
      v_row->>'parcel_id',
      v_row->>'state',
      v_row->>'county',
      v_row->>'address',
      v_row->>'city',
      v_row->>'zip',
      ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(v_row->>'geom_geojson'), 4326)),
      (v_row->>'centroid_lat')::double precision,
      (v_row->>'centroid_lng')::double precision,
      v_row->'raw_props',
      v_row->>'source'
    )
    on conflict (county, parcel_id, state) do update set
      address      = excluded.address,
      city         = excluded.city,
      zip          = excluded.zip,
      geom         = excluded.geom,
      centroid_lat = excluded.centroid_lat,
      centroid_lng = excluded.centroid_lng,
      raw_props    = excluded.raw_props,
      source       = excluded.source,
      imported_at  = now();
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.upsert_parcels_batch(jsonb) from public, anon, authenticated;
-- service_role role bypasses RLS and has implicit grant on public functions.
