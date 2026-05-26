// Shared utilities for catalog-import adapters. Talks to Supabase via the
// service-role key (bypasses RLS — intended for backfills only). Same .mjs
// style + storage-path convention as the older scripts/import-clayton-models.mjs.

import { createClient } from '../../apps/admin/node_modules/@supabase/supabase-js/dist/index.mjs';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// ── Env loading ──────────────────────────────────────────────────────────────

function loadDotEnv(path) {
  try {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === '') process.env[key] = val;
    }
  } catch {
    // missing file is fine — user may have exported env directly
  }
}

loadDotEnv(resolve(REPO_ROOT, 'apps/public/.env.local'));
loadDotEnv(resolve(REPO_ROOT, 'apps/admin/.env.local'));
loadDotEnv(resolve(REPO_ROOT, '.env.local'));

export function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'getServiceClient: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. ' +
        'Populate apps/public/.env.local or export them in your shell.',
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Resolvers ────────────────────────────────────────────────────────────────

export async function resolveOrgId(sb, orgSlug) {
  if (orgSlug) {
    const { data } = await sb.from('orgs').select('id, name').eq('slug', orgSlug).maybeSingle();
    if (!data) throw new Error(`resolveOrgId: no org with slug "${orgSlug}"`);
    return { id: data.id, name: data.name };
  }
  const { data } = await sb
    .from('orgs')
    .select('id, name, slug')
    .eq('status', 'active')
    .order('created_at')
    .limit(2);
  if (!data || data.length === 0) throw new Error('resolveOrgId: no active orgs in this Supabase project');
  if (data.length > 1) {
    throw new Error(
      `resolveOrgId: multiple active orgs — pass --org-slug to disambiguate (${data.map((o) => o.slug).join(', ')})`,
    );
  }
  return { id: data[0].id, name: data[0].name };
}

export async function resolveManufacturerId(sb, slug) {
  const { data } = await sb.from('manufacturers').select('id, name').eq('slug', slug).maybeSingle();
  if (!data) throw new Error(`resolveManufacturerId: no manufacturer with slug "${slug}"`);
  return { id: data.id, name: data.name };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

const DEFAULT_UA = 'UHS-Catalog-Importer/1.0 (+michael@upstatehomesales.com)';

export async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': DEFAULT_UA } });
  if (!res.ok) throw new Error(`fetchText ${url}: HTTP ${res.status}`);
  return await res.text();
}

export async function fetchBytes(url) {
  const res = await fetch(url, { headers: { 'User-Agent': DEFAULT_UA } });
  if (!res.ok) throw new Error(`fetchBytes ${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Catalog writes ───────────────────────────────────────────────────────────

const MODEL_FIELDS = [
  'name',
  'model_code',
  'series',
  'type',
  'beds',
  'baths',
  'sqft',
  'width_ft',
  'length_ft',
  'year_built',
  'construction',
  'headline',
  'description',
  'source_url',
];

function pickModelRow(orgId, manufacturerId, data) {
  const row = { org_id: orgId, manufacturer_id: manufacturerId };
  for (const key of MODEL_FIELDS) {
    const v = data[key === 'model_code' ? 'modelCode' : toCamel(key)];
    if (v != null) row[key] = v;
  }
  return row;
}

function toCamel(snake) {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export async function upsertHomeModel(sb, orgId, manufacturerId, data, { update }) {
  const { data: existing } = await sb
    .from('home_models')
    .select('id')
    .eq('org_id', orgId)
    .eq('name', data.name)
    .is('deleted_at', null)
    .maybeSingle();

  const row = pickModelRow(orgId, manufacturerId, data);

  if (existing) {
    if (!update) return { id: existing.id, action: 'skipped' };
    const { error } = await sb.from('home_models').update(row).eq('id', existing.id);
    if (error) throw new Error(`update home_models ${data.name}: ${error.message}`);
    return { id: existing.id, action: 'updated' };
  }

  const { data: inserted, error } = await sb
    .from('home_models')
    .insert(row)
    .select('id')
    .single();
  if (error || !inserted) throw new Error(`insert home_models ${data.name}: ${error?.message ?? 'no row'}`);
  return { id: inserted.id, action: 'created' };
}

// ── Photo sync ───────────────────────────────────────────────────────────────

const BUCKET = 'home-photos';

function extensionFromUrl(url) {
  const m = url.split('?')[0].match(/\.(\w{2,5})$/);
  return (m ? m[1] : 'jpg').toLowerCase();
}

function contentTypeFor(ext) {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

export async function syncModelPhotos(sb, orgId, modelId, photos, { replaceAll, throttleMs = 150 }) {
  if (replaceAll) {
    const { data: existing } = await sb
      .from('home_model_photos')
      .select('storage_path')
      .eq('home_model_id', modelId);
    const paths = (existing ?? []).map((r) => r.storage_path);
    if (paths.length > 0) {
      await sb.storage.from(BUCKET).remove(paths);
      await sb.from('home_model_photos').delete().eq('home_model_id', modelId);
    }
  } else {
    const { count } = await sb
      .from('home_model_photos')
      .select('id', { count: 'exact', head: true })
      .eq('home_model_id', modelId);
    if ((count ?? 0) > 0) return { uploaded: 0, total: 0, skipped: true };
  }

  let uploaded = 0;
  for (const p of photos) {
    try {
      const bytes = await fetchBytes(p.url);
      const ext = extensionFromUrl(p.url);
      const seq = String(p.sortOrder).padStart(3, '0');
      const path = `${orgId}/${modelId}/${seq}-${p.kind}-${cryptoRandom()}.${ext}`;
      const { error: upErr } = await sb.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: contentTypeFor(ext), upsert: false });
      if (upErr) {
        console.warn(`    ! storage ${path}: ${upErr.message}`);
        continue;
      }
      const { error: rowErr } = await sb.from('home_model_photos').insert({
        home_model_id: modelId,
        org_id: orgId,
        storage_path: path,
        sort_order: p.sortOrder,
        alt_text: p.alt ?? null,
      });
      if (rowErr) {
        console.warn(`    ! home_model_photos ${path}: ${rowErr.message}`);
        continue;
      }
      uploaded++;
    } catch (e) {
      console.warn(`    ! photo ${p.url}: ${e.message}`);
    }
    if (throttleMs > 0) await sleep(throttleMs);
  }
  return { uploaded, total: photos.length, skipped: false };
}

function cryptoRandom() {
  // Quick uuid-ish, doesn't need to be cryptographically strong — just unique per file.
  return Math.random().toString(36).slice(2, 10);
}

// ── Run orchestration ────────────────────────────────────────────────────────

export async function runImport({ adapter, orgSlug, apply, update, only, listOpts }) {
  let sb = null;
  let org = null;
  let mfr = null;
  if (apply) {
    sb = getServiceClient();
    org = await resolveOrgId(sb, orgSlug);
    mfr = await resolveManufacturerId(sb, adapter.manufacturerSlug);
  }

  console.log(`Adapter:      ${adapter.displayName} (${adapter.slug})`);
  if (org) console.log(`Org:          ${org.name} (${org.id})`);
  if (mfr) console.log(`Manufacturer: ${mfr.name} (${mfr.id})`);
  console.log(`Mode:         ${apply ? (update ? 'APPLY + UPDATE' : 'APPLY') : 'DRY-RUN (no DB writes, no env required)'}`);
  console.log();

  const refs = await adapter.listModels(listOpts ?? {});
  const filteredRefs = only?.length
    ? refs.filter((r) => only.some((n) => n.toUpperCase() === r.name.toUpperCase()))
    : refs;

  console.log(
    `Discovered ${refs.length} model(s)${only?.length ? `, filtered to ${filteredRefs.length}` : ''}.`,
  );
  console.log();

  const results = [];
  for (const ref of filteredRefs) {
    try {
      if (adapter.crawlDelayMs) await sleep(adapter.crawlDelayMs);
      const data = await adapter.fetchModel(ref);
      const summary = `${data.name.padEnd(14)} ${String(data.beds ?? '?').padStart(2)}bd ${String(data.baths ?? '?').padStart(3)}ba ${String(data.sqft ?? '?').padStart(5)}sf ${data.widthFt ?? '?'}x${data.lengthFt ?? '?'}  photos=${data.photos.length}`;

      if (!apply) {
        console.log(`  · ${summary}`);
        results.push({ name: data.name, action: 'would-create', photos: data.photos.length });
        continue;
      }

      const { id: modelId, action } = await upsertHomeModel(sb, org.id, mfr.id, data, { update });
      if (action === 'skipped') {
        console.log(`  = ${summary}  (already exists — pass --update to refresh)`);
        results.push({ name: data.name, action, photos: 0 });
        continue;
      }
      const photoResult = await syncModelPhotos(sb, org.id, modelId, data.photos, {
        replaceAll: action === 'updated',
      });
      const photoTag = photoResult.skipped
        ? 'photos already present — skip'
        : `${photoResult.uploaded}/${photoResult.total} photos`;
      const tag = action === 'created' ? '+' : '~';
      console.log(`  ${tag} ${summary}  ${photoTag}`);
      results.push({ name: data.name, action, photos: photoResult.uploaded });
    } catch (e) {
      console.log(`  ! ${ref.name}: ${e.message}`);
      results.push({ name: ref.name, action: 'error', error: e.message });
    }
  }

  console.log();
  const created = results.filter((r) => r.action === 'created').length;
  const updated = results.filter((r) => r.action === 'updated').length;
  const skipped = results.filter((r) => r.action === 'skipped').length;
  const would = results.filter((r) => r.action === 'would-create').length;
  const errors = results.filter((r) => r.action === 'error').length;
  if (!apply) {
    console.log(`Summary (dry-run): ${would} would be created · re-run with --apply to write.`);
  } else {
    console.log(`Summary: ${created} created · ${updated} updated · ${skipped} skipped · ${errors} errors.`);
  }
  return { results, exitCode: errors > 0 ? 1 : 0 };
}
