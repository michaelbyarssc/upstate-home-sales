#!/usr/bin/env node
// Paginated GeoJSON dump from an ArcGIS FeatureServer / MapServer layer.
// Usage:
//   node fetch-county-parcels.mjs <layerUrl> <output.geojson> [whereClause]
// Examples:
//   node fetch-county-parcels.mjs \
//     "https://maps.spartanburgcounty.org/server/rest/services/GIS/CAMA_Parcels/FeatureServer/0" \
//     ./data/spartanburg-sc-parcels.geojson
//   node fetch-county-parcels.mjs \
//     "https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/MapServer/1" \
//     ./data/wake-nc-parcels.geojson \
//     "cntyname='WAKE'"

import { createWriteStream } from 'node:fs';
import { performance } from 'node:perf_hooks';

const [, , layerUrl, outputPath, whereClause] = process.argv;
if (!layerUrl || !outputPath) {
  console.error('usage: node fetch-county-parcels.mjs <layerUrl> <outputPath> [whereClause]');
  process.exit(2);
}
const where = whereClause && whereClause.trim() ? whereClause : '1=1';

async function fetchJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const j = await r.json();
  // ArcGIS sometimes returns 200 OK with a body like
  //   {"error":{"code":400,"message":"Failed to execute query.","details":[]}}
  // when resultRecordCount exceeds a server-side limit or another constraint
  // fails. Promote that to a throw so the retry/bisect logic kicks in.
  if (j && typeof j === 'object' && j.error && j.error.code) {
    throw new Error(`ArcGIS error ${j.error.code}: ${j.error.message ?? ''}`);
  }
  return j;
}

async function main() {
  // Discover page size + total count.
  const info = await fetchJson(`${layerUrl}?f=pjson`);
  const pageSize = Math.min(info.maxRecordCount ?? 2000, 2000);
  const countJson = await fetchJson(`${layerUrl}/query?where=${encodeURIComponent(where)}&returnCountOnly=true&f=json`);
  const total = countJson.count;
  console.log(`layer=${info.name} where=${where} total=${total} page_size=${pageSize}`);

  const stream = createWriteStream(outputPath, { encoding: 'utf8' });
  stream.write('{"type":"FeatureCollection","features":[');

  let written = 0;
  let first = true;
  const t0 = performance.now();
  let skippedPages = 0;
  try {
    for (let offset = 0; offset < total; offset += pageSize) {
      const url =
        `${layerUrl}/query?where=${encodeURIComponent(where)}` +
        `&outFields=*` +
        `&outSR=4326` +
        `&resultOffset=${offset}` +
        `&resultRecordCount=${pageSize}` +
        `&returnGeometry=true` +
        `&f=geojson`;
      let attempt = 0;
      let page = null;
      let pageErr = null;
      while (attempt < 4) {
        try {
          page = await fetchJson(url);
          break;
        } catch (e) {
          pageErr = e;
          attempt++;
          if (attempt >= 4) break;
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
      if (!page) {
        // Bisect — sweep the failed page in 100-record chunks. Some ArcGIS
        // endpoints (e.g. SCDOT Allendale) cap at ~100/page; bigger requests
        // 200 with an `error` body. 100 covers every cap we've seen.
        let subRecovered = 0;
        const subSize = 100;
        for (let sub = 0; sub < pageSize; sub += subSize) {
          const want = Math.min(subSize, pageSize - sub);
          const subUrl =
            `${layerUrl}/query?where=${encodeURIComponent(where)}` +
            `&outFields=*&outSR=4326` +
            `&resultOffset=${offset + sub}` +
            `&resultRecordCount=${want}` +
            `&returnGeometry=true&f=geojson`;
          try {
            const subPage = await fetchJson(subUrl);
            const feats = Array.isArray(subPage.features) ? subPage.features : [];
            for (const f of feats) {
              if (!first) stream.write(',');
              stream.write(JSON.stringify(f));
              first = false;
              subRecovered++;
            }
          } catch {
            // Even at 100/page this slice failed; drop it. Rare.
          }
        }
        skippedPages++;
        written += subRecovered;
        process.stdout.write(`\n  bad page at offset=${offset} — recovered ${subRecovered} of ${pageSize} via bisect (err=${pageErr?.message?.slice(0,80)})\n`);
        continue;
      }
      const features = Array.isArray(page.features) ? page.features : [];
      for (const f of features) {
        if (!first) stream.write(',');
        stream.write(JSON.stringify(f));
        first = false;
      }
      written += features.length;
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      process.stdout.write(`\r  written=${written}/${total} (${elapsed}s)`);
    }
  } finally {
    process.stdout.write('\n');
    stream.write(']}');
    await new Promise((r) => stream.end(r));
  }
  console.log(`done → ${outputPath} (skippedPages=${skippedPages}, written=${written})`);
}

main().catch((e) => {
  console.error('failed:', e);
  process.exit(1);
});
