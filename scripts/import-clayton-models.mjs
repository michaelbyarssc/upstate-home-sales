// One-shot import: pulls Clayton model data from clayton-models-data.mjs,
// downloads photos from api.claytonhomes.com, uploads to home-photos bucket,
// inserts homes (status='draft', no pricing) and home_photos rows.
//
// Run from repo root after setting env:
//   set -a && . /tmp/uhs-import-creds.env && set +a
//   node scripts/import-clayton-models.mjs
//
// Re-run safe: skips homes whose stock_no already exists for this org.

import { createClient } from '../apps/admin/node_modules/@supabase/supabase-js/dist/index.mjs';
import { Buffer } from 'node:buffer';
import { MODELS } from './clayton-models-data.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = '00000000-0000-0000-0000-000000000001';
const CLAYTON_MFR_ID = '9e2af2f7-717c-469e-84d2-02b243f9746b';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function altFor(kind) {
  return kind === 'ext' ? 'exterior' : kind === 'int' ? 'interior' : 'floor plan';
}

async function downloadAndUpload(homeId, kind, uuid, sortOrder) {
  const srcUrl = `https://api.claytonhomes.com/images/mfg/${kind}/${uuid}.jpg?width=1600`;
  const res = await fetch(srcUrl);
  if (!res.ok) {
    console.warn(`  ! skip ${kind}/${uuid}: HTTP ${res.status}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const path = `${ORG_ID}/${homeId}/${String(sortOrder).padStart(3, '0')}-${kind}-${uuid}.jpg`;
  const { error: upErr } = await sb.storage
    .from('home-photos')
    .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
  if (upErr) {
    console.warn(`  ! upload ${path}: ${upErr.message}`);
    return null;
  }
  return path;
}

async function importModel(m) {
  // Skip if a home with this stock_no already exists in the org.
  const { data: existing } = await sb
    .from('homes')
    .select('id, status')
    .eq('org_id', ORG_ID)
    .eq('stock_no', m.code)
    .maybeSingle();
  if (existing) {
    console.log(`= ${m.code} ${m.name} already exists (id=${existing.id}, status=${existing.status}) — skipping`);
    return { skipped: true };
  }

  const { data: home, error: homeErr } = await sb
    .from('homes')
    .insert({
      org_id: ORG_ID,
      stock_no: m.code,
      name: `Clayton ${m.name}`,
      manufacturer_id: CLAYTON_MFR_ID,
      model: m.name,
      type: m.type,
      beds: m.beds,
      baths: m.baths,
      sqft: m.sqft,
      width_ft: m.width_ft,
      length_ft: m.length_ft,
      year_built: m.year_built,
      base_price_cents: 0,
      markup_pct: 0,
      addons_cents: 0,
      setup_cents: 0,
      include_setup_in_price: true,
      status: 'draft',
      headline: m.headline,
      description: m.description,
    })
    .select('id')
    .single();
  if (homeErr || !home) {
    console.error(`! ${m.code}: home insert failed: ${homeErr?.message ?? 'no row'}`);
    return { error: true };
  }
  console.log(`+ ${m.code} ${m.name} → home_id=${home.id}`);

  let order = 0;
  let uploaded = 0;
  for (const kind of ['ext', 'int', 'flp']) {
    for (const uuid of m.photos[kind]) {
      const path = await downloadAndUpload(home.id, kind, uuid, order);
      if (path) {
        const { error: photoErr } = await sb.from('home_photos').insert({
          home_id: home.id,
          org_id: ORG_ID,
          storage_path: path,
          sort_order: order,
          alt_text: `${m.name} — ${altFor(kind)}`,
        });
        if (photoErr) console.warn(`  ! home_photos row ${path}: ${photoErr.message}`);
        else uploaded++;
      }
      order++;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  console.log(`  ${uploaded}/${order} photos uploaded for ${m.name}`);
  return { ok: true, homeId: home.id, uploaded, total: order };
}

(async () => {
  console.log(`Importing ${MODELS.length} Clayton Epic Series models into org ${ORG_ID}…`);
  const results = [];
  for (const m of MODELS) {
    try {
      const r = await importModel(m);
      results.push({ code: m.code, name: m.name, ...r });
    } catch (e) {
      console.error(`! ${m.code} unexpected error:`, e);
      results.push({ code: m.code, name: m.name, error: true });
    }
  }
  console.log('\n=== Summary ===');
  for (const r of results) {
    const tag = r.skipped ? 'SKIP' : r.error ? 'FAIL' : 'OK  ';
    console.log(`${tag}  ${r.code}  ${r.name}${r.uploaded != null ? `  (${r.uploaded}/${r.total} photos)` : ''}`);
  }
})();
