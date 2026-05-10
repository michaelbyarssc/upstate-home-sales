// One-shot, idempotent migration: rename the Lexington org → Spartanburg,
// archive the Lexington and Anderson lots, rename the existing
// "Spartanburg SC" lot to "Spartanburg", and move all homes off the
// archived lots onto Spartanburg.
//
// Usage:
//   set -a && . /tmp/uhs-import-creds.env && set +a
//   node scripts/migrate-lexington-to-spartanburg.mjs
//
// Re-run safe: each step short-circuits if the change is already applied.

import { createClient } from '../apps/admin/node_modules/@supabase/supabase-js/dist/index.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = '00000000-0000-0000-0000-000000000001';
const LEX_LOT_ID = '00000000-0000-0000-0000-000000000010';
const AND_LOT_ID = '00000000-0000-0000-0000-000000000011';
const SPGB_LOT_ID = 'fe1448f2-0609-42f1-b7a9-48034fcd4a6b';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let touched = 0;

// ─── 1. Rename org ─────────────────────────────────────────────────────────
const { data: org, error: orgErr } = await sb
  .from('orgs')
  .select('name, slug')
  .eq('id', ORG_ID)
  .single();
if (orgErr || !org) {
  console.error('Failed to fetch org:', orgErr?.message);
  process.exit(1);
}

if (/Lexington/i.test(org.name) || org.slug === 'uhs-lexington') {
  const { error } = await sb
    .from('orgs')
    .update({ name: 'Upstate Home Sales — Spartanburg', slug: 'uhs-spartanburg' })
    .eq('id', ORG_ID);
  if (error) {
    console.error('Org rename failed:', error.message);
    process.exit(1);
  }
  console.log(`+ Org renamed: "${org.name}" / ${org.slug} → "Upstate Home Sales — Spartanburg" / uhs-spartanburg`);
  touched++;
} else {
  console.log(`= Org already renamed: "${org.name}" / ${org.slug}`);
}

// ─── 2. Rename Spartanburg SC lot → Spartanburg ────────────────────────────
const { data: spgb, error: spgbErr } = await sb
  .from('lots')
  .select('name, deleted_at')
  .eq('id', SPGB_LOT_ID)
  .single();
if (spgbErr || !spgb) {
  console.error('Failed to fetch Spartanburg lot:', spgbErr?.message);
  process.exit(1);
}

if (spgb.name !== 'Spartanburg') {
  const { error } = await sb.from('lots').update({ name: 'Spartanburg' }).eq('id', SPGB_LOT_ID);
  if (error) {
    console.error('Spartanburg lot rename failed:', error.message);
    process.exit(1);
  }
  console.log(`+ Lot renamed: "${spgb.name}" → "Spartanburg"`);
  touched++;
} else {
  console.log(`= Spartanburg lot already named "Spartanburg"`);
}

// ─── 3. Move homes off Lex+And lots → Spartanburg ──────────────────────────
const { data: toMove, error: moveSelErr } = await sb
  .from('homes')
  .select('id, stock_no, lot_id')
  .in('lot_id', [LEX_LOT_ID, AND_LOT_ID])
  .is('deleted_at', null);
if (moveSelErr) {
  console.error('Failed to query homes on Lex+And:', moveSelErr.message);
  process.exit(1);
}

if (toMove.length > 0) {
  const { error: moveErr } = await sb
    .from('homes')
    .update({ lot_id: SPGB_LOT_ID })
    .in('id', toMove.map((h) => h.id));
  if (moveErr) {
    console.error('Home move failed:', moveErr.message);
    process.exit(1);
  }
  console.log(`+ Moved ${toMove.length} homes to Spartanburg lot:`);
  for (const h of toMove) {
    console.log(`   - ${h.stock_no}  (was ${h.lot_id === LEX_LOT_ID ? 'Lexington' : 'Anderson'})`);
  }
  touched += toMove.length;
} else {
  console.log('= No homes left on Lex+And lots — nothing to move');
}

// ─── 4. Soft-delete Lex + And lots ─────────────────────────────────────────
for (const [id, label] of [[LEX_LOT_ID, 'Lexington'], [AND_LOT_ID, 'Anderson']]) {
  const { data: lot } = await sb
    .from('lots')
    .select('name, deleted_at')
    .eq('id', id)
    .single();
  if (!lot) {
    console.log(`= ${label} lot not found — skipping`);
    continue;
  }
  if (lot.deleted_at) {
    console.log(`= ${label} lot already archived (${lot.deleted_at})`);
    continue;
  }
  const { error } = await sb
    .from('lots')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error(`! ${label} lot archive failed: ${error.message}`);
    continue;
  }
  console.log(`+ Archived ${label} lot (${id})`);
  touched++;
}

console.log(`\n=== Done. ${touched} change(s) applied. ===`);
