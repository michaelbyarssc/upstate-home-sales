#!/usr/bin/env node
// CLI entry for catalog scrapers. Loads the named adapter and runs it.
//
// Usage:
//   node scripts/import-catalog/index.mjs --adapter clayton-epic-journey [--region 3]
//   node scripts/import-catalog/index.mjs --adapter clayton-epic-journey --apply
//   node scripts/import-catalog/index.mjs --adapter clayton-epic-journey --apply --update --only SEVIER
//
// Flags:
//   --adapter <slug>      required — name of the adapter file under adapters/
//   --org-slug <slug>     optional — pick a specific org; defaults to the single active one
//   --region <id>         optional — passed through to the adapter (Clayton uses 3 for South)
//   --apply               actually write to Supabase (default: dry-run)
//   --update              refresh specs + photos for models that already exist (default: skip)
//   --only <NAMES>        comma-separated list of model names to limit the run to

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runImport } from './framework.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { adapter: null, orgSlug: null, region: null, apply: false, update: false, only: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eat = () => argv[++i];
    if (a === '--adapter') out.adapter = eat();
    else if (a === '--org-slug') out.orgSlug = eat();
    else if (a === '--region') out.region = eat();
    else if (a === '--apply') out.apply = true;
    else if (a === '--update') out.update = true;
    else if (a === '--only') out.only = eat().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '-h' || a === '--help') {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      printUsage();
      process.exit(2);
    }
  }
  if (!out.adapter) {
    console.error('Missing --adapter');
    printUsage();
    process.exit(2);
  }
  return out;
}

function printUsage() {
  console.error(
    [
      'Usage: node scripts/import-catalog/index.mjs --adapter <slug> [options]',
      '',
      'Required:',
      '  --adapter <slug>     adapter file under scripts/import-catalog/adapters/',
      '',
      'Options:',
      '  --org-slug <slug>    target org (default: single active org)',
      '  --region <id>        adapter-specific region (Clayton: 3 = South)',
      '  --apply              write to Supabase (default: dry-run)',
      '  --update             refresh existing models (default: skip)',
      '  --only NAME1,NAME2   limit to these model names',
    ].join('\n'),
  );
}

const args = parseArgs(process.argv.slice(2));
const adapterPath = resolve(__dirname, 'adapters', `${args.adapter}.mjs`);

let adapterModule;
try {
  adapterModule = await import(adapterPath);
} catch (e) {
  console.error(`Failed to load adapter "${args.adapter}" from ${adapterPath}`);
  console.error(e.message);
  process.exit(2);
}
const adapter = adapterModule.default;
if (!adapter || typeof adapter.listModels !== 'function') {
  console.error(`Adapter "${args.adapter}" does not export a default { listModels, fetchModel }.`);
  process.exit(2);
}

const { exitCode } = await runImport({
  adapter,
  orgSlug: args.orgSlug,
  apply: args.apply,
  update: args.update,
  only: args.only,
  listOpts: { region: args.region },
});

process.exit(exitCode);
