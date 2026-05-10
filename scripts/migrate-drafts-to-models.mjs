// One-shot, idempotent migration: convert draft homes (no lot_id) into
// home_models catalog entries. Moves home_photos rows over to
// home_model_photos (storage paths reused — files stay where they are).
// The original draft homes are deleted (cascade clears their photo rows).
//
// Usage:
//   set -a && . /tmp/uhs-import-creds.env && set +a
//   node scripts/migrate-drafts-to-models.mjs
//
// Re-run safe: skips homes whose names already exist in home_models for the org.

import { createClient } from '../apps/admin/node_modules/@supabase/supabase-js/dist/index.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function deriveSeries(stockNo) {
  if (!stockNo) return null;
  if (/^30CEE/i.test(stockNo)) return 'Clayton Epic';
  if (/^CAVCO-D-/i.test(stockNo)) return 'Cavco Douglas';
  if (/^CAVCO-H-/i.test(stockNo)) return 'Cavco Hamlet';
  return null;
}

function deriveModelCode(stockNo) {
  if (!stockNo) return null;
  // Cavco stocks: CAVCO-{D|H}-{NAME}-{CODE} → take the trailing code segment
  const m = stockNo.match(/^CAVCO-[DH]-.*-([0-9]{4,5}[A-Z])$/i);
  if (m) return m[1].toUpperCase();
  return stockNo;
}

const { data: drafts, error: draftErr } = await sb
  .from('homes')
  .select('id, org_id, stock_no, name, manufacturer_id, model, type, beds, baths, sqft, width_ft, length_ft, year_built, construction, headline, description, status, lot_id')
  .is('lot_id', null)
  .eq('status', 'draft')
  .is('deleted_at', null)
  .order('created_at');

if (draftErr) {
  console.error('Failed to fetch drafts:', draftErr.message);
  process.exit(1);
}

console.log(`Found ${drafts.length} draft homes (lot_id=null, status='draft') to migrate.`);

let created = 0, skipped = 0, failed = 0, photosMoved = 0;

for (const h of drafts) {
  // Skip if a model with this name already exists (idempotent)
  const { data: existing } = await sb
    .from('home_models')
    .select('id')
    .eq('org_id', h.org_id)
    .eq('name', h.name)
    .maybeSingle();
  if (existing) {
    console.log(`= ${h.stock_no} → model already exists (id=${existing.id}); deleting old draft`);
    const { error: delErr } = await sb.from('homes').delete().eq('id', h.id);
    if (delErr) {
      console.warn(`  ! delete draft failed: ${delErr.message}`);
      failed++;
    } else {
      skipped++;
    }
    continue;
  }

  // Insert the model template
  const { data: model, error: modelErr } = await sb
    .from('home_models')
    .insert({
      org_id: h.org_id,
      manufacturer_id: h.manufacturer_id,
      name: h.name,
      model_code: deriveModelCode(h.stock_no),
      series: deriveSeries(h.stock_no),
      type: h.type,
      beds: h.beds,
      baths: h.baths,
      sqft: h.sqft,
      width_ft: h.width_ft,
      length_ft: h.length_ft,
      year_built: h.year_built,
      construction: h.construction,
      headline: h.headline,
      description: h.description,
    })
    .select('id')
    .single();
  if (modelErr || !model) {
    console.error(`! ${h.stock_no}: model insert failed: ${modelErr?.message}`);
    failed++;
    continue;
  }

  // Pull this home's photos and move them to home_model_photos
  const { data: photos, error: photoSelErr } = await sb
    .from('home_photos')
    .select('storage_path, sort_order, alt_text, width, height')
    .eq('home_id', h.id)
    .order('sort_order');
  if (photoSelErr) {
    console.warn(`  ! photo select failed: ${photoSelErr.message}`);
  }
  if (photos && photos.length > 0) {
    const rows = photos.map((p) => ({
      home_model_id: model.id,
      org_id: h.org_id,
      storage_path: p.storage_path,
      sort_order: p.sort_order,
      alt_text: p.alt_text,
      width: p.width,
      height: p.height,
    }));
    const { error: photoInsErr, count } = await sb
      .from('home_model_photos')
      .insert(rows, { count: 'exact' });
    if (photoInsErr) {
      console.warn(`  ! photo insert failed: ${photoInsErr.message}`);
    } else {
      photosMoved += rows.length;
    }
  }

  // Delete original draft (cascade removes its home_photos rows;
  // storage files remain — home_model_photos point at the same paths)
  const { error: delErr } = await sb.from('homes').delete().eq('id', h.id);
  if (delErr) {
    console.warn(`  ! delete draft failed: ${delErr.message}`);
    // Don't count as failed — the model is created, just leftover home row
  }

  console.log(`+ ${h.stock_no} → model ${model.id} (${photos?.length ?? 0} photos)`);
  created++;
}

console.log('\n=== Summary ===');
console.log(`Created: ${created} models`);
console.log(`Skipped (already migrated): ${skipped}`);
console.log(`Failed: ${failed}`);
console.log(`Photos moved: ${photosMoved}`);
