/**
 * Parcel-data lookup client (provider-agnostic).
 *
 * Used by the property-mapping admin page to look up a parcel by address or
 * APN, get back the polygon GeoJSON + centroid + county, and cache the
 * response in `parcels_cache` for 24h so revisits don't burn API quota.
 *
 * Provider is selected by env var `PARCEL_PROVIDER` (default 'mock'):
 *   - 'mock'   → returns a synthetic 150ft × 150ft square; no network call.
 *                Use for local dev, demos, and Vercel previews.
 *   - 'regrid' → calls Regrid v2 API. Requires REGRID_API_TOKEN. ~$500/mo SC.
 *   - 'diy'    → looks up from our own PostGIS-loaded SC county shapefiles.
 *                Phase E.2 — not yet wired in this PR. Falls back to mock
 *                until the DIY data pipeline ships.
 *
 * Defaulting to 'mock' means local dev + Vercel previews work without any
 * paid accounts. Production sets PARCEL_PROVIDER + the matching credentials
 * once a real provider is chosen.
 *
 * Regrid v2 docs: https://app.regrid.com/api/v2/docs
 *   GET /api/v2/parcels/address?query=<addr>&token=<token>
 *   GET /api/v2/parcels/apn?parcelnumb=<apn>&token=<token>
 *
 * All providers normalize to the same `ParcelLookup` shape so the UI is
 * provider-blind.
 */

import type { ParcelGeoJson } from '@uhs/db';
import { createClient } from '@uhs/db/server';

export type ParcelLookup = {
  parcel_id: string;
  address: string | null;
  county: string | null;
  centroid_lat: number;
  centroid_lng: number;
  geojson: ParcelGeoJson;
  /** True when the result came from the local cache instead of a live API call. */
  cached: boolean;
  /** True when we returned a mock because REGRID_API_TOKEN is unset (dev mode). */
  mock: boolean;
};

export type ParcelLookupArgs = {
  /** Free-text query — usually an address. */
  query: string;
  /** Optional: search by APN/parcel number directly. */
  apn?: string;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const REGRID_BASE = 'https://app.regrid.com/api/v2';

function normalizeKey(args: ParcelLookupArgs): string {
  const k = args.apn ? `apn:${args.apn}` : `addr:${args.query}`;
  return k.toLowerCase().trim();
}

/** Compute a polygon centroid from GeoJSON Polygon or MultiPolygon coordinates. */
function centroid(geojson: ParcelGeoJson): { lat: number; lng: number } {
  const rings: number[][][] =
    geojson.type === 'Polygon'
      ? (geojson.coordinates as number[][][])
      : ((geojson.coordinates as number[][][][])[0] ?? []);
  const ring = rings[0] ?? [];
  if (ring.length === 0) return { lat: 0, lng: 0 };
  let sumLng = 0;
  let sumLat = 0;
  for (const pt of ring) {
    sumLng += pt[0] ?? 0;
    sumLat += pt[1] ?? 0;
  }
  return { lat: sumLat / ring.length, lng: sumLng / ring.length };
}

/** Mock parcel for dev when REGRID_API_TOKEN is unset. Returns a square
 *  ~150ft on a side centered on Lexington, SC (or the search query if it
 *  contains lat/lng like "34.55,-81.23"). Lets the UI render end-to-end. */
function mockParcel(args: ParcelLookupArgs): ParcelLookup {
  // Look for "lat,lng" in the query so dev can place mock parcels anywhere.
  const m = args.query.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  const centerLat = m ? Number(m[1]) : 33.9815; // Lexington, SC default
  const centerLng = m ? Number(m[2]) : -81.2362;
  // Roughly 150ft × 150ft. 1 deg lat ≈ 364,000 ft; 1 deg lng at 34°N ≈ 302,000 ft.
  const halfLatDeg = 75 / 364_000;
  const halfLngDeg = 75 / 302_000;
  const ring: number[][] = [
    [centerLng - halfLngDeg, centerLat - halfLatDeg],
    [centerLng + halfLngDeg, centerLat - halfLatDeg],
    [centerLng + halfLngDeg, centerLat + halfLatDeg],
    [centerLng - halfLngDeg, centerLat + halfLatDeg],
    [centerLng - halfLngDeg, centerLat - halfLatDeg],
  ];
  const geojson: ParcelGeoJson = { type: 'Polygon', coordinates: [ring] };
  return {
    parcel_id: `mock-${Date.now()}`,
    address: args.query,
    county: 'Lexington (mock)',
    centroid_lat: centerLat,
    centroid_lng: centerLng,
    geojson,
    cached: false,
    mock: true,
  };
}

/** Fetch from Regrid, throw on non-OK. */
async function fetchRegrid(args: ParcelLookupArgs, token: string): Promise<ParcelLookup | null> {
  const url = args.apn
    ? `${REGRID_BASE}/parcels/apn?parcelnumb=${encodeURIComponent(args.apn)}&token=${encodeURIComponent(token)}`
    : `${REGRID_BASE}/parcels/address?query=${encodeURIComponent(args.query)}&token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Regrid lookup failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as RegridFeatureCollection;
  const feat = body?.features?.[0];
  if (!feat) return null;

  const geojson = feat.geometry as ParcelGeoJson;
  const props = (feat.properties?.fields ?? feat.properties ?? {}) as Record<string, unknown>;
  const c = centroid(geojson);

  const parcelnumb = (props.parcelnumb ?? props.parcel_num ?? props.apn ?? feat.id ?? '') as string;
  const address = (props.address ?? props.saddress ?? null) as string | null;
  const county = (props.scounty ?? props.county ?? null) as string | null;

  return {
    parcel_id: String(parcelnumb),
    address,
    county,
    centroid_lat: c.lat,
    centroid_lng: c.lng,
    geojson,
    cached: false,
    mock: false,
  };
}

interface RegridFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    id?: string;
    type: 'Feature';
    geometry: ParcelGeoJson;
    properties: {
      fields?: Record<string, unknown>;
      [k: string]: unknown;
    };
  }>;
}

// ─── DIY provider: geocode + PostGIS point-in-polygon ──────────────────────

/** Geocode an address string to lat/lng using Google Maps Geocoding API.
 *  Reuses GOOGLE_MAPS_API_KEY (server-side) — set this separately from
 *  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY because the public key is referrer-locked
 *  to the browser and won't work from a server function. */
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.GOOGLE_MAPS_GEOCODING_KEY ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    // No server-side key — fall through. Caller will degrade to mock.
    return null;
  }
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:US|administrative_area:SC&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    status?: string;
    results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
  };
  const loc = body.results?.[0]?.geometry?.location;
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;
  return { lat: loc.lat, lng: loc.lng };
}

/** DIY provider: geocode the address, then run point-in-polygon against
 *  the imported county parcels via the lookup_parcel_by_point RPC. */
async function fetchDiy(args: ParcelLookupArgs): Promise<ParcelLookup | null> {
  // APN lookups bypass geocoding — go straight to the parcels table by id.
  if (args.apn) {
    const supabase = createClient();
    const { data } = await supabase
      .from('parcels')
      .select('parcel_id, county, address, centroid_lat, centroid_lng')
      .eq('parcel_id', args.apn)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    // No polygon yet — caller would need to fetch separately. The RPC below
    // is the standard path. APN-only lookup is a v2 enhancement.
    return {
      parcel_id: data.parcel_id,
      address: data.address,
      county: data.county,
      centroid_lat: data.centroid_lat,
      centroid_lng: data.centroid_lng,
      // Empty geometry — mark this lookup as incomplete.
      geojson: { type: 'Polygon', coordinates: [] },
      cached: false,
      mock: false,
    };
  }

  // Address path: geocode → spatial query.
  const geocoded = await geocodeAddress(args.query);
  if (!geocoded) return null;

  const supabase = createClient();
  const { data, error } = await supabase.rpc('lookup_parcel_by_point', {
    p_lat: geocoded.lat,
    p_lng: geocoded.lng,
  });
  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    // No parcel covers this point — likely the county isn't imported yet.
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    parcel_id: row.parcel_id,
    address: row.address ?? args.query,
    county: row.county,
    centroid_lat: row.centroid_lat,
    centroid_lng: row.centroid_lng,
    geojson: row.geojson as ParcelGeoJson,
    cached: false,
    mock: false,
  };
}

/** Resolve which provider to use, given env config + available credentials.
 *  Logic:
 *    - Explicit PARCEL_PROVIDER env wins.
 *    - 'regrid' selected only when REGRID_API_TOKEN is also set; else falls to mock.
 *    - 'diy' uses our Supabase PostGIS `parcels` table (Phase E.2). If a county
 *      isn't loaded, falls through to regrid (if token) or mock.
 *    - Default = 'diy' (always available — empty county = mock fallback).
 */
type Provider = 'mock' | 'regrid' | 'diy';
function resolveProvider(): Provider {
  const explicit = (process.env.PARCEL_PROVIDER ?? '').toLowerCase().trim();
  const hasRegridToken = !!process.env.REGRID_API_TOKEN;
  if (explicit === 'mock') return 'mock';
  if (explicit === 'regrid') return hasRegridToken ? 'regrid' : 'mock';
  if (explicit === 'diy') return 'diy';
  // No explicit choice: prefer DIY (free), fall back inside the dispatcher.
  return 'diy';
}

/** Public entry point. Cache-first; falls back to the configured provider;
 *  falls back to mock when no provider is configured. */
export async function lookupParcel(args: ParcelLookupArgs): Promise<ParcelLookup | null> {
  const supabase = createClient();
  const cacheKey = normalizeKey(args);

  // 1. Cache lookup.
  const { data: cached } = await supabase
    .from('parcels_cache')
    .select('*')
    .eq('cache_key', cacheKey)
    .maybeSingle();

  if (cached) {
    const age = Date.now() - new Date(cached.cached_at).getTime();
    if (age < CACHE_TTL_MS) {
      return {
        parcel_id: cached.parcel_id,
        address: cached.address,
        county: cached.county,
        centroid_lat: cached.centroid_lat,
        centroid_lng: cached.centroid_lng,
        geojson: cached.geojson as ParcelGeoJson,
        cached: true,
        mock: false,
      };
    }
  }

  // 2. Dispatch to the chosen provider with graceful fallback.
  //    DIY can return null when the county isn't imported yet; in that case
  //    we fall through to regrid (if available) or mock so the UI never
  //    leaves the user staring at a "no parcel found" error in dev.
  const provider = resolveProvider();
  let result: ParcelLookup | null = null;

  if (provider === 'diy') {
    result = await fetchDiy(args);
    if (!result) {
      // DIY missed (no county data, no geocoder key, or no match).
      // Try regrid if configured.
      if (process.env.REGRID_API_TOKEN) {
        result = await fetchRegrid(args, process.env.REGRID_API_TOKEN);
      }
    }
  } else if (provider === 'regrid') {
    result = await fetchRegrid(args, process.env.REGRID_API_TOKEN!);
  }

  // Final fallback: mock. Always returns something so the UI flow can be
  // walked end-to-end even with zero credentials configured.
  if (!result) {
    result = mockParcel(args);
  }
  if (!result) return null;

  // 3. Cache the result (skip mocks — they're not stable lookups).
  if (!result.mock) {
    await supabase.from('parcels_cache').upsert(
      {
        cache_key: cacheKey,
        parcel_id: result.parcel_id,
        address: result.address,
        county: result.county,
        centroid_lat: result.centroid_lat,
        centroid_lng: result.centroid_lng,
        geojson: result.geojson,
        cached_at: new Date().toISOString(),
      },
      { onConflict: 'cache_key' },
    );
  }

  return result;
}
