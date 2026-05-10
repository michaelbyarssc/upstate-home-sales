// One-shot import: fetches Cavco floorplan data from the cavcohomes.com
// resourceapi for both the Douglas (552) and Hamlet (604) building centers,
// downloads photos from cdn2.cavco.com, uploads to home-photos bucket, and
// inserts homes (status='draft', no pricing) and home_photos rows.
//
// Run from repo root after setting env:
//   set -a && . /tmp/uhs-import-creds.env && set +a
//   node scripts/import-cavco-models.mjs
//
// Re-run safe: skips homes whose stock_no already exists for this org.

import { createClient } from '../apps/admin/node_modules/@supabase/supabase-js/dist/index.mjs';
import { Buffer } from 'node:buffer';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = '00000000-0000-0000-0000-000000000001';
const CAVCO_MFR_ID = null; // looked up at runtime

const PHOTO_CAP = 30; // max photos per home
const FETCH_DELAY_MS = 1500;
const UPLOAD_DELAY_MS = 100;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DOUGLAS_SLUGS = [
  '552-the-summit-32764p','552-the-summit-28764b','552-the-summit-32644d','552-the-perry-28764c',
  '552-pinnacle-28704c','552-the-summit-28684b','552-the-summit-28643b','552-vantage-32563n',
  '552-vivid-28603n','552-the-pinnacle-28623a','552-summit-28564t','552-the-summit-28563b',
  '552-the-summit-32483a','552-the-summit-28523a','552-the-summit-24563a','552-the-summit-24563u',
  '552-economy-28523k','552-pinnacle-28483p','552-the-summit-28483b','552-the-pinnacle-16764w',
  '552-keystone-16763d','552-the-pinnacle-16763b','552-valor-16763n','552-westfield-classic-16763z',
  '552-grady-16722a','552-keystone-16663a','552-the-summit-24403b','552-westfield-classic-14663i',
  '552-keystone-16562a','552-economy-16602y','552-westfield-classic-14562k','552-keystone-16401a',
  '552-the-rose-12401u',
];
const HAMLET_SLUGS = [
  '604-phoenix-32764a','604-the-phoenix-32684a','604-the-phoenix-32563a','604-phoenix-32483a',
  '604-phoenix-32483b','604-the-phoenix-16763a','604-phoenix-16663a','604-phoenix-16603a',
  '604-augusta-16562a',
];

// ─── Find Cavco mfr id ─────────────────────────────────────────────────────
const { data: mfr, error: mfrErr } = await sb
  .from('manufacturers')
  .select('id')
  .eq('slug', 'cavco')
  .single();
if (mfrErr || !mfr) {
  console.error('Could not find Cavco manufacturer:', mfrErr?.message);
  process.exit(1);
}
const MFR_ID = mfr.id;
console.log(`Cavco mfr id: ${MFR_ID}`);

// ─── Walk JSON tree to find the data block whose name matches a slug ──────
function findHomeData(obj, slug) {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const r = findHomeData(v, slug);
      if (r) return r;
    }
    return null;
  }
  if (obj.name === slug && obj.modelName && obj.assetId) return obj;
  for (const v of Object.values(obj)) {
    const r = findHomeData(v, slug);
    if (r) return r;
  }
  return null;
}

// ─── Pick & dedupe photos for a home from the API response text ───────────
function selectPhotos(jsonText, assetId, cap) {
  const re = new RegExp(`https://cdn2\\.cavco\\.com/[^"'\\s)]*?/gallery/file/${assetId}/[^"'\\s)]+\\.jpe?g`, 'g');
  const all = [...new Set(jsonText.match(re) || [])];
  // Group by base filename (strip variant suffixes), pick the URL with timestamp.
  const groups = new Map();
  for (const u of all) {
    const fn = u.split('/').pop();
    const key = fn.replace(/(_\d{13})?_\d+_\d+\.jpe?g$/i, '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(u);
  }
  const picked = [...groups.values()].map((urls) => {
    const withTs = urls.find((u) => /_\d{13}_/.test(u));
    return withTs || urls[0];
  });
  // Order: floor plans first (filenames containing 'flp' or 'fp' or labeled), then exteriors,
  // then interiors. We don't have reliable category labels in the URL — sort by filename for stability.
  picked.sort((a, b) => a.localeCompare(b));
  return picked.slice(0, cap);
}

function parseSlugCode(slug) {
  // e.g. "552-the-summit-32764p" → "32764P"; "604-augusta-16562a" → "16562A"
  const m = slug.match(/-(\d{4,5}[a-z])$/i);
  return m ? m[1].toUpperCase() : slug.toUpperCase();
}

function dimsFromCode(code) {
  // first 2 chars = width, next 2 = length
  const w = parseInt(code.slice(0, 2), 10);
  const l = parseInt(code.slice(2, 4), 10);
  return { width_ft: Number.isFinite(w) ? w : null, length_ft: Number.isFinite(l) ? l : null };
}

function buildDescription(d) {
  const sect = d.sections || '';
  const sectLow = sect.toLowerCase();
  const isSingle = /single/.test(sectLow);
  const seriesNote = d.series ? ` Part of Cavco's ${d.series} series.` : '';
  return `${d.modelName} ${d.modelNumber} is a ${d.numBedrooms}-bedroom, ${d.numBathrooms}-bath ${isSingle ? 'single-wide' : 'double-wide'} with ${d.squareFootage?.toLocaleString?.() ?? d.squareFootage} sq ft.${seriesNote} Built by Cavco at the ${d.plant ?? ''} plant.`.trim();
}

function buildHeadline(d) {
  return `${d.modelName} ${d.modelNumber} — ${d.numBedrooms} bd / ${d.numBathrooms} ba / ${d.squareFootage?.toLocaleString?.() ?? d.squareFootage} sq ft`;
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0 Safari/537.36';

async function fetchModel(line, slug) {
  const url = `https://www.cavcohomes.com/resourceapi/building-center/${line}/floorplans/${slug}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
  const text = await r.text();
  const data = JSON.parse(text);
  const block = findHomeData(data, slug);
  if (!block) throw new Error(`No data block for ${slug}`);

  const code = block.modelNumber || parseSlugCode(slug);
  // dimensions: prefer API fields, fallback to slug-derived
  let width_ft = parseInt(block.flrPlanWidthFeet, 10);
  let length_ft = parseInt(block.flrPlanLengthFeet, 10);
  if (!Number.isFinite(width_ft) || !Number.isFinite(length_ft)) {
    const fb = dimsFromCode(code);
    width_ft = Number.isFinite(width_ft) ? width_ft : fb.width_ft;
    length_ft = Number.isFinite(length_ft) ? length_ft : fb.length_ft;
  }

  const home = {
    slug,
    line,
    plant: line === 'douglas' ? 'Cavco - Douglas (Douglas, GA)' : 'Cavco - Hamlet (Hamlet, NC)',
    code,
    name: block.displayName || `${block.modelName} ${block.modelNumber}`,
    modelName: block.modelName,
    modelNumber: block.modelNumber,
    series: block.series,
    sqft: block.squareFootage,
    sections: block.sections,
    numBedrooms: block.numBedrooms,
    numBathrooms: block.numBathrooms,
    width_ft,
    length_ft,
    assetId: block.assetId,
  };
  const photos = selectPhotos(text, block.assetId, PHOTO_CAP);
  return { home, photos };
}

function homeType(sections, width_ft) {
  if (sections && /single/i.test(sections)) return 'single';
  if (width_ft && width_ft <= 18) return 'single';
  return 'double';
}

async function importOne(line, slug) {
  // Skip if home with this stock_no already exists
  const stockNo = `CAVCO-${line.slice(0, 1).toUpperCase()}-${slug.replace(/^\d+-/, '').toUpperCase()}`;
  const { data: existing } = await sb
    .from('homes')
    .select('id, status')
    .eq('org_id', ORG_ID)
    .eq('stock_no', stockNo)
    .maybeSingle();
  if (existing) {
    console.log(`= ${stockNo} already exists (id=${existing.id}, status=${existing.status}) — skipping`);
    return { skipped: true };
  }

  let modelData;
  try {
    modelData = await fetchModel(line, slug);
  } catch (e) {
    console.error(`! ${slug}: fetch failed: ${e.message}`);
    return { error: true };
  }
  const { home: h, photos } = modelData;

  const { data: home, error: he } = await sb
    .from('homes')
    .insert({
      org_id: ORG_ID,
      stock_no: stockNo,
      name: `Cavco ${h.name}`,
      manufacturer_id: MFR_ID,
      model: h.modelName,
      type: homeType(h.sections, h.width_ft),
      beds: h.numBedrooms,
      baths: h.numBathrooms,
      sqft: h.sqft,
      width_ft: h.width_ft,
      length_ft: h.length_ft,
      year_built: 2026,
      base_price_cents: 0,
      markup_pct: 0,
      addons_cents: 0,
      setup_cents: 0,
      include_setup_in_price: true,
      status: 'draft',
      headline: buildHeadline(h),
      description: buildDescription(h),
    })
    .select('id')
    .single();
  if (he || !home) {
    console.error(`! ${stockNo}: home insert failed: ${he?.message ?? 'no row'}`);
    return { error: true };
  }
  console.log(`+ ${stockNo} → ${home.id}  (${photos.length} photos)`);

  let order = 0;
  let uploaded = 0;
  for (const url of photos) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) {
        console.warn(`  ! photo ${url} HTTP ${res.status}`);
        order++;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const fname = url.split('/').pop().split('?')[0];
      const path = `${ORG_ID}/${home.id}/${String(order).padStart(3, '0')}-${fname}`;
      const { error: ue } = await sb.storage
        .from('home-photos')
        .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
      if (ue) {
        console.warn(`  ! upload ${path}: ${ue.message}`);
        order++;
        continue;
      }
      const { error: pe } = await sb.from('home_photos').insert({
        home_id: home.id,
        org_id: ORG_ID,
        storage_path: path,
        sort_order: order,
        alt_text: `${h.modelName} ${h.modelNumber} — photo ${order + 1}`,
      });
      if (pe) console.warn(`  ! home_photos row ${path}: ${pe.message}`);
      else uploaded++;
    } catch (e) {
      console.warn(`  ! photo ${url}: ${e.message}`);
    }
    order++;
    await new Promise((r) => setTimeout(r, UPLOAD_DELAY_MS));
  }
  console.log(`  ${uploaded}/${photos.length} photos uploaded for ${stockNo}`);
  return { ok: true, homeId: home.id, uploaded, total: photos.length };
}

const ALL = [
  ...DOUGLAS_SLUGS.map((s) => ({ line: 'douglas', slug: s })),
  ...HAMLET_SLUGS.map((s) => ({ line: 'hamlet', slug: s })),
];

console.log(`Importing ${ALL.length} Cavco models (${DOUGLAS_SLUGS.length} Douglas + ${HAMLET_SLUGS.length} Hamlet) into org ${ORG_ID}…`);
const results = [];
for (const { line, slug } of ALL) {
  try {
    const r = await importOne(line, slug);
    results.push({ line, slug, ...r });
  } catch (e) {
    console.error(`! ${slug} unexpected:`, e);
    results.push({ line, slug, error: true });
  }
  await new Promise((r) => setTimeout(r, FETCH_DELAY_MS));
}

console.log('\n=== Summary ===');
let ok = 0, skip = 0, fail = 0, photos = 0;
for (const r of results) {
  const tag = r.skipped ? 'SKIP' : r.error ? 'FAIL' : 'OK  ';
  if (r.skipped) skip++; else if (r.error) fail++; else { ok++; photos += r.uploaded || 0; }
  console.log(`${tag}  [${r.line.slice(0, 1).toUpperCase()}]  ${r.slug}${r.uploaded != null ? `  (${r.uploaded}/${r.total} photos)` : ''}`);
}
console.log(`\n${ok} ok, ${skip} skipped, ${fail} failed.  ${photos} photos uploaded.`);
