# Catalog import scripts

A small framework + per-manufacturer adapters for backfilling the dealer's
`home_models` catalog from public manufacturer websites. Writes via the
Supabase service-role key.

## Run

```sh
# Dry-run (default) — prints what would happen.
node scripts/import-catalog/index.mjs --adapter clayton-epic-journey --region 3

# Apply for real.
node scripts/import-catalog/index.mjs --adapter clayton-epic-journey --region 3 --apply

# Refresh photos + specs for a model that already exists.
node scripts/import-catalog/index.mjs --adapter clayton-epic-journey --apply --update --only SEVIER
```

Env required (read from `apps/public/.env.local` automatically, or export):

```
SUPABASE_URL=...                  # or NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=...
```

Flags:

| Flag | Meaning |
|---|---|
| `--adapter <slug>` | Which adapter file under `adapters/` to load (required). |
| `--org-slug <slug>` | Target org; default = the single active org. |
| `--region <id>` | Adapter-specific (Clayton: `3` = South). |
| `--apply` | Actually write to Supabase. Default is dry-run. |
| `--update` | Refresh specs + photos for models that already exist. Default: skip. |
| `--only NAME1,NAME2` | Limit to specific model names (uppercase, case-insensitive). |

## How it works

- `index.mjs` — CLI entry. Parses args, dynamically imports the adapter, calls `runImport`.
- `framework.mjs` — shared utilities: env loading, Supabase service-role client, org/manufacturer resolution, `upsertHomeModel`, `syncModelPhotos` (downloads photo URLs and uploads to the `home-photos` bucket), and the run orchestrator that logs every step.
- `adapters/<slug>.mjs` — one file per manufacturer site. Exports `{ slug, displayName, manufacturerSlug, crawlDelayMs, listModels, fetchModel }`.

The framework writes to `home_models` (the catalog), not `homes` (inventory). The dealer can later use the existing **"Stock on Lot"** bulk action in admin to materialize physical units from any catalog row.

## Adding a new manufacturer

1. Copy `adapters/clayton-epic-journey.mjs` to `adapters/<new-slug>.mjs`.
2. Set `manufacturerSlug` to one of the seeded brand slugs (`cavco`, `champion`, `clayton-built`, `deer-valley`, `franklin`, `live-oak`, `skyline`, `trumh`).
3. Adjust `listModels` and `fetchModel` for the new site's HTML — selectors, photo URL pattern, spec parsing.
4. Respect the site's `robots.txt`: set `crawlDelayMs` accordingly.
5. Test with dry-run first, then `--apply`.

## Idempotency

- Re-running without `--update` is a no-op for existing models (matched by `(org_id, name)` — the table's unique constraint).
- With `--update`, photos are replaced atomically: old `home_model_photos` rows + storage files are deleted before the fresh set is uploaded.

## Photo storage

Photos land in the `home-photos` bucket at `{orgId}/{modelId}/{NN}-{kind}-{rand}.{ext}` — same convention as `apps/admin/.../photo-upload.ts` and the older `scripts/import-clayton-models.mjs`.

## Etiquette

- Sets a clear `User-Agent`.
- Adapter declares `crawlDelayMs`; framework sleeps between each detail-page fetch.
- Skips already-imported models by default — repeat runs don't re-hammer the source.
- Manufacturer-published model assets are intended for dealer use. If a manufacturer ever objects, we can mass-delete a brand from the bucket by org/model path.
