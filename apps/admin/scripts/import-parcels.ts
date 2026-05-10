/**
 * Import a county's parcel GeoJSON into the `parcels` table.
 *
 * Usage:
 *   pnpm --filter @uhs/admin tsx scripts/import-parcels.ts \
 *     --file=./data/lexington-sc-parcels.geojson \
 *     --county=Lexington \
 *     --state=SC \
 *     --source=https://lexingtonsc.gov/gis
 *
 * Notes:
 *   - Reads the entire file into memory (fine for SC counties; biggest is
 *     Greenville at ~120k features → ~80MB JSON). For multi-state in the
 *     future, swap in a streaming parser like stream-json.
 *   - Extracts an `id` field from each feature using a configurable list of
 *     property names (parcelnumb, PIN, OBJECTID, parcel_id, gis_pin, etc.).
 *   - Extracts an `address` from a configurable list (saddress, address, situs).
 *   - Inserts in batches of 500 for throughput.
 *   - Idempotent: upserts on (county, parcel_id, state).
 *   - Records the run in `parcel_imports` for audit visibility.
 *
 * Requires:
 *   - SUPABASE_SERVICE_ROLE_KEY in the env (writes bypass RLS).
 *   - NEXT_PUBLIC_SUPABASE_URL.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createServiceClient } from '@uhs/db/service';

type Args = {
  file: string;
  county: string;
  state: string;
  source: string;
  /** Comma-sep list of property keys to try for the parcel id, in priority. */
  idKeys: string[];
  /** Comma-sep list of property keys to try for street address. */
  addressKeys: string[];
  cityKey: string;
  zipKey: string;
  batchSize: number;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Record<string, string> = {};
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m && m[1]) out[m[1]] = m[2] ?? '';
  }
  if (!out.file || !out.county) {
    console.error('Usage: tsx scripts/import-parcels.ts --file=<path> --county=<name> [--state=SC] [--source=<url>] [--id-keys=parcelnumb,PIN] [--address-keys=saddress,address] [--city-key=scity] [--zip-key=szip] [--batch-size=500] [--dry-run]');
    process.exit(1);
  }
  return {
    file: out.file,
    county: out.county,
    state: (out.state ?? 'SC').toUpperCase(),
    source: out.source ?? path.basename(out.file),
    idKeys: (out['id-keys'] ?? 'parcelnumb,PIN,parcel_id,APN,parcel_num,gis_pin,OBJECTID')
      .split(',').map((s) => s.trim()).filter(Boolean),
    addressKeys: (out['address-keys'] ?? 'saddress,address,situs,site_addr,prop_addr')
      .split(',').map((s) => s.trim()).filter(Boolean),
    cityKey: out['city-key'] ?? 'scity',
    zipKey: out['zip-key'] ?? 'szip',
    batchSize: Math.max(1, Math.min(2000, parseInt(out['batch-size'] ?? '500', 10) || 500)),
    dryRun: out['dry-run'] === 'true' || (out['dry-run'] !== undefined && out['dry-run'] !== ''),
  };
}

interface GeoJsonFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  } | null;
  properties: Record<string, unknown>;
  id?: string | number;
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

function pickStr(props: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = props[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

/** Convert a Polygon to a MultiPolygon (Postgres column type). */
function ensureMulti(geom: GeoJsonFeature['geometry']): GeoJsonFeature['geometry'] {
  if (!geom) return geom;
  if (geom.type === 'MultiPolygon') return geom;
  return {
    type: 'MultiPolygon',
    coordinates: [geom.coordinates as number[][][]],
  };
}

/** Centroid (average of first ring's vertices) — same approximation used
 *  by the Regrid client. Good enough for compact residential parcels. */
function computeCentroid(geom: GeoJsonFeature['geometry']): { lat: number; lng: number } | null {
  if (!geom) return null;
  const rings: number[][][] =
    geom.type === 'Polygon'
      ? (geom.coordinates as number[][][])
      : (geom.coordinates as number[][][][])[0] ?? [];
  const ring = rings[0] ?? [];
  if (ring.length === 0) return null;
  let sLat = 0;
  let sLng = 0;
  for (const pt of ring) {
    sLng += pt[0] ?? 0;
    sLat += pt[1] ?? 0;
  }
  return { lat: sLat / ring.length, lng: sLng / ring.length };
}

async function main() {
  const args = parseArgs(process.argv);
  const sb = createServiceClient();

  console.log(`[parcels] Loading ${args.file}…`);
  const raw = fs.readFileSync(args.file, 'utf8');
  const fc = JSON.parse(raw) as GeoJsonFeatureCollection;
  if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw new Error('Expected GeoJSON FeatureCollection at top level');
  }
  console.log(`[parcels] ${fc.features.length} features in ${args.county} ${args.state}`);

  type Row = {
    parcel_id: string;
    state: string;
    county: string;
    address: string | null;
    city: string | null;
    zip: string | null;
    geom: GeoJsonFeature['geometry'];
    centroid_lat: number;
    centroid_lng: number;
    raw_props: Record<string, unknown>;
    source: string;
  };
  const rows: Row[] = [];
  let skipped = 0;
  for (const f of fc.features) {
    if (!f.geometry) { skipped++; continue; }
    const parcelId = pickStr(f.properties, args.idKeys) ?? (f.id != null ? String(f.id) : null);
    if (!parcelId) { skipped++; continue; }
    const c = computeCentroid(f.geometry);
    if (!c) { skipped++; continue; }
    rows.push({
      parcel_id: parcelId,
      state: args.state,
      county: args.county,
      address: pickStr(f.properties, args.addressKeys),
      city: pickStr(f.properties, [args.cityKey]),
      zip: pickStr(f.properties, [args.zipKey]),
      geom: ensureMulti(f.geometry),
      centroid_lat: c.lat,
      centroid_lng: c.lng,
      raw_props: f.properties,
      source: args.source,
    });
  }
  console.log(`[parcels] Prepared ${rows.length} rows (skipped ${skipped} without geom or id)`);

  if (args.dryRun) {
    console.log('[parcels] --dry-run: no rows inserted. Sample row:');
    console.log(JSON.stringify({ ...rows[0], raw_props: '<truncated>', geom: '<truncated>' }, null, 2));
    return;
  }

  // Upsert in batches. We can't use the JS client's upsert with PostGIS
  // geometry directly, so we go through a temporary RPC: serialize geom as
  // GeoJSON text, the SQL function uses ST_GeomFromGeoJSON.
  let total = 0;
  for (let i = 0; i < rows.length; i += args.batchSize) {
    const batch = rows.slice(i, i + args.batchSize);
    const payload = batch.map((r) => ({
      parcel_id: r.parcel_id,
      state: r.state,
      county: r.county,
      address: r.address,
      city: r.city,
      zip: r.zip,
      geom_geojson: JSON.stringify(r.geom),
      centroid_lat: r.centroid_lat,
      centroid_lng: r.centroid_lng,
      raw_props: r.raw_props,
      source: r.source,
    }));
    const { error } = await sb.rpc('upsert_parcels_batch', { p_rows: payload });
    if (error) {
      console.error(`[parcels] Batch ${i}-${i + batch.length} failed:`, error.message);
      throw error;
    }
    total += batch.length;
    process.stdout.write(`[parcels] ${total}/${rows.length}\r`);
  }
  console.log(`\n[parcels] Inserted ${total} rows.`);

  // Record the run.
  await sb.from('parcel_imports').insert({
    state: args.state,
    county: args.county,
    source: args.source,
    feature_count: rows.length,
    notes: `Imported via scripts/import-parcels.ts (skipped ${skipped})`,
  });
  console.log(`[parcels] Done. ${args.county}, ${args.state}: ${rows.length} parcels live.`);
}

main().catch((err) => {
  console.error('[parcels] Failed:', err);
  process.exit(1);
});
