// Cavco Homes — manufacturer 'cavco'. cavcohomes.com is a Bloomreach React SPA:
// the served HTML is an empty shell, so we read the same JSON APIs the app uses.
//   1. Page API    GET  /resourceapi/building-center/{slug}/floorplans
//      → cavco:BuildingCenter doc (plantLocationUid) + public Elastic App Search config.
//   2. Search API  POST {endpointBase}/api/as/v1/engines/{engine}/search
//      filtered by {type: floorplan, plant_location_id} → every model in one query.
//   3. Detail API  GET  /resourceapi{model-path} → displayName, specs, photo albums
//      (mediaAsset entries labeled "Exterior Photo" / "Interior Photo" / "Line Drawing").

import { fetchText } from '../framework';
import type { CatalogAdapter, ModelData, ModelPhoto, ModelRef } from '../types';

const HOST = 'cavcohomes.com';
const BASE = 'https://www.cavcohomes.com';
const PHOTO_CAP = 20;

// Fallback if the page config can't be parsed. This is the public search-only
// key cavcohomes.com ships to every browser — not a secret.
const ES_FALLBACK = {
  endpointBase: 'https://cavco.ent.us-central1.gcp.cloud.es.io',
  engineName: 'cavco',
  apiKey: 'search-o493tsi19ocqdb4xkzpqhytj',
};

const SEARCH_HINT =
  'Cavco search pages list every model available near a location. Paste a building-center page instead, e.g. https://www.cavcohomes.com/building-center/moultrie/floorplans';

// Summary data from the search index, stashed on each ModelRef so fetchModel
// can fill gaps (or survive a failed detail fetch) without re-querying.
type CavcoSummary = {
  modelNumber?: string;
  series?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  widthFt?: number;
  lengthFt?: number;
  sections?: string;
  buildingMethod?: string;
  centerName?: string;
  photos: Array<{ url: string; alt?: string }>;
  lineDrawings: Array<{ url: string; alt?: string }>;
};

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function raw(v: unknown): unknown {
  return v && typeof v === 'object' && 'raw' in (v as Record<string, unknown>)
    ? (v as Record<string, unknown>).raw
    : undefined;
}

async function fetchPageModel(path: string): Promise<Record<string, any>> {
  const text = await fetchText(`${BASE}/resourceapi${path}`);
  return JSON.parse(text) as Record<string, any>;
}

function pageDocs(pageModel: Record<string, any>): Record<string, any> {
  return (pageModel?.page ?? {}) as Record<string, any>;
}

function findBuildingCenter(docs: Record<string, any>): Record<string, any> | null {
  for (const v of Object.values(docs)) {
    if (v?.data?.contentType === 'cavco:BuildingCenter') return v.data;
  }
  return null;
}

function findEsConfig(docs: Record<string, any>): typeof ES_FALLBACK | null {
  for (const v of Object.values(docs)) {
    const d = v?.data;
    if (d?.name !== 'elasticsearchconfig') continue;
    if (!Array.isArray(d.keys) || !Array.isArray(d.messages)) continue;
    const cfg: Record<string, string> = {};
    d.keys.forEach((k: string, i: number) => {
      cfg[k] = String(d.messages[i] ?? '');
    });
    if (cfg.endpointBase && cfg.engineName && cfg.apiKey) {
      return { endpointBase: cfg.endpointBase, engineName: cfg.engineName, apiKey: cfg.apiKey };
    }
  }
  return null;
}

function findModelBlock(docs: Record<string, any>): Record<string, any> | null {
  for (const v of Object.values(docs)) {
    const d = v?.data;
    if (d?.modelName && d?.assetId) return d;
  }
  return null;
}

async function searchFloorplans(
  es: typeof ES_FALLBACK,
  plantLocationUid: string,
): Promise<Array<Record<string, any>>> {
  const results: Array<Record<string, any>> = [];
  for (let current = 1; ; current++) {
    const res = await fetch(`${es.endpointBase}/api/as/v1/engines/${es.engineName}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${es.apiKey}`,
        'User-Agent': 'UHS-Catalog-Importer/1.0 (+michael@upstatehomesales.com)',
      },
      body: JSON.stringify({
        query: '',
        page: { size: 100, current },
        filters: { all: [{ type: 'floorplan' }, { plant_location_id: plantLocationUid }] },
      }),
    });
    if (!res.ok) throw new Error(`Cavco search: HTTP ${res.status}`);
    const body = (await res.json()) as Record<string, any>;
    results.push(...((body.results ?? []) as Array<Record<string, any>>));
    const page = body.meta?.page;
    if (!page || current >= Number(page.total_pages ?? 1) || results.length >= 500) break;
  }
  return results;
}

function parseImageList(jsonStr: unknown): Array<{ url: string; alt?: string }> {
  if (typeof jsonStr !== 'string' || !jsonStr) return [];
  try {
    const arr = JSON.parse(jsonStr);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((o: any) => ({ url: String(o?.url ?? ''), alt: o?.imageAltText ? String(o.imageAltText) : undefined }))
      .filter((o) => o.url.startsWith('https://'));
  } catch {
    return [];
  }
}

// Model names repeat across floorplans ("Iron Ranch" has 4 variants), and the
// catalog upserts on (org_id, name) — so the model number is part of the name.
// Matches the site's own displayName convention ("Iron Ranch 28563A").
function canonicalName(name: string, modelNumber: string | undefined): string {
  const n = name.trim();
  if (!modelNumber) return n;
  return n.toUpperCase().includes(modelNumber.toUpperCase()) ? n : `${n} ${modelNumber}`;
}

function isDetailPath(path: string): boolean {
  const last = path.split('/').filter(Boolean).pop() ?? '';
  return /^\d+-.+/.test(last) && !/\/floorplans\/search\//.test(path);
}

// Nominal dims encoded in model codes like "28563A" → 28 wide, 56 long.
function dimsFromCode(code: string | undefined): { widthFt?: number; lengthFt?: number } {
  const m = code?.match(/^(\d{2})(\d{2})/);
  if (!m) return {};
  return { widthFt: parseInt(m[1]!, 10), lengthFt: parseInt(m[2]!, 10) };
}

function homeType(sections: string | undefined, buildingMethod: string | undefined, widthFt: number | undefined): ModelData['type'] {
  if (sections && /single/i.test(sections)) return 'single';
  if (buildingMethod && /modular/i.test(buildingMethod)) return 'modular';
  if (widthFt && widthFt <= 18) return 'single';
  return 'double';
}

// Resolve a photo/lineDrawings album ($ref → media document) into image URLs,
// picking the largest rendition of each asset.
function albumImages(
  docs: Record<string, any>,
  refObj: unknown,
): Array<{ url: string; imageType: string; alt?: string }> {
  const ref = (refObj as { $ref?: string } | null)?.$ref;
  if (!ref) return [];
  const doc = docs[ref.split('/').pop() ?? ''];
  const assets = (doc?.data?.mediaAsset ?? []) as Array<Record<string, any>>;
  const out: Array<{ url: string; imageType: string; alt?: string }> = [];
  for (const asset of assets) {
    const xi = asset?.ximage ?? {};
    let best: { url: string; width: number } | null = null;
    for (const key of ['originalImage', 'large', 'medium', 'small']) {
      const r = xi[key];
      if (r?.url && (!best || Number(r.width ?? 0) > best.width)) {
        best = { url: String(r.url), width: Number(r.width ?? 0) };
      }
    }
    if (best) {
      out.push({
        url: best.url,
        imageType: String(asset.imageType ?? ''),
        alt: xi.title ? String(xi.title) : undefined,
      });
    }
  }
  return out;
}

function classifyKind(imageType: string): ModelPhoto['kind'] {
  if (/line|drawing|floor/i.test(imageType)) return 'floorplan';
  if (/exterior/i.test(imageType)) return 'exterior';
  return 'interior';
}

function buildPhotos(
  name: string,
  gallery: Array<{ url: string; imageType: string; alt?: string }>,
  drawings: Array<{ url: string; imageType: string; alt?: string }>,
): ModelPhoto[] {
  const order = { exterior: 0, interior: 1, floorplan: 2 } as const;
  const seen = new Set<string>();
  const all = [...gallery, ...drawings]
    .map((p) => ({ ...p, kind: classifyKind(p.imageType) }))
    .filter((p) => (seen.has(p.url) ? false : (seen.add(p.url), true)))
    .sort((a, b) => order[a.kind] - order[b.kind]);
  // Keep every floorplan drawing; cap the photo gallery.
  const plans = all.filter((p) => p.kind === 'floorplan');
  const rest = all.filter((p) => p.kind !== 'floorplan').slice(0, Math.max(0, PHOTO_CAP - plans.length));
  return [...rest, ...plans].map((p, i) => ({
    url: p.url,
    kind: p.kind,
    sortOrder: i,
    alt: p.alt ?? `${name} — ${p.kind}`,
  }));
}

function summaryFromHit(hit: Record<string, any>, centerName: string | undefined): CavcoSummary {
  return {
    modelNumber: raw(hit.model_number) ? String(raw(hit.model_number)) : undefined,
    series: raw(hit.series) ? String(raw(hit.series)) : undefined,
    beds: num(raw(hit.number_of_bedrooms)),
    baths: num(raw(hit.number_of_bathrooms)),
    sqft: num(raw(hit.square_foot)),
    widthFt: num(raw(hit.width_feet)),
    lengthFt: num(raw(hit.length_feet)),
    sections: raw(hit.sections) ? String(raw(hit.sections)) : undefined,
    buildingMethod: raw(hit.building_method) ? String(raw(hit.building_method)) : undefined,
    centerName,
    photos: parseImageList(raw(hit.photos)),
    lineDrawings: parseImageList(raw(hit.line_drawings)),
  };
}

const adapter: CatalogAdapter = {
  slug: 'cavco',
  displayName: 'Cavco Homes',
  manufacturerSlug: 'cavco',
  // robots.txt sets no crawl-delay; 1s between detail fetches is politeness.
  crawlDelayMs: 1000,

  matches(url: string): boolean {
    try {
      const h = new URL(url).hostname;
      return h === HOST || h.endsWith(`.${HOST}`);
    } catch {
      return false;
    }
  },

  async listModels({ url }) {
    const path = new URL(url).pathname.replace(/\/+$/, '');

    // Individual floorplan page (e.g. /our-homes/.../588-iron-ranch-28563a).
    if (isDetailPath(path)) {
      const docs = pageDocs(await fetchPageModel(path));
      const block = findModelBlock(docs);
      if (!block) throw new Error(`Cavco: no floorplan data found at ${url}`);
      const name =
        (block.displayName as string | undefined)?.trim() ||
        canonicalName(String(block.modelName), block.modelNumber ? String(block.modelNumber) : undefined);
      return [{ name, detailUrl: `${BASE}${path}` }];
    }

    // Building-center pages: /building-center/{slug}[/floorplans[/search/...]]
    // all resolve to the center's full floorplan list.
    const center = path.match(/^\/building-center\/([^/]+)/)?.[1];
    if (!center) throw new Error(SEARCH_HINT);

    const docs = pageDocs(await fetchPageModel(`/building-center/${center}/floorplans`));
    const bc = findBuildingCenter(docs);
    const plantUid = bc?.plantLocationUid ? String(bc.plantLocationUid) : null;
    if (!plantUid) {
      throw new Error(`Cavco: "${center}" doesn't look like a building center. ${SEARCH_HINT}`);
    }
    const centerName = (bc?.dba as string | undefined) || (bc?.name as string | undefined);

    const hits = await searchFloorplans(findEsConfig(docs) ?? ES_FALLBACK, plantUid);
    const refs: ModelRef[] = [];
    for (const hit of hits) {
      const baseName = raw(hit.name) ? String(raw(hit.name)) : undefined;
      const detailPath = raw(hit.url) ? String(raw(hit.url)) : undefined;
      if (!baseName || !detailPath) continue;
      const summary = summaryFromHit(hit, centerName);
      const name = canonicalName(baseName, summary.modelNumber);
      if (refs.some((r) => r.name === name)) continue;
      refs.push({ name, detailUrl: `${BASE}${detailPath}`, summary });
    }
    refs.sort((a, b) => a.name.localeCompare(b.name));
    return refs;
  },

  async fetchModel(ref) {
    const s = (ref.summary ?? { photos: [], lineDrawings: [] }) as CavcoSummary;
    const path = new URL(ref.detailUrl).pathname;

    let block: Record<string, any> | null = null;
    let docs: Record<string, any> = {};
    try {
      docs = pageDocs(await fetchPageModel(path));
      block = findModelBlock(docs);
    } catch {
      // Detail page unreachable — fall back to the search-index summary below.
    }

    const modelCode = (block?.modelNumber ? String(block.modelNumber) : undefined) ?? s.modelNumber;
    const fromCode = dimsFromCode(modelCode);
    const widthFt = num(block?.flrPlanWidthFeet) ?? s.widthFt ?? fromCode.widthFt;
    const lengthFt = num(block?.flrPlanLengthFeet) ?? s.lengthFt ?? fromCode.lengthFt;
    const beds = num(block?.numBedrooms) ?? s.beds;
    const baths = num(block?.numBathrooms) ?? s.baths;
    const sqft = num(block?.squareFootage) ?? s.sqft;
    const series = (block?.series ? String(block.series) : undefined) ?? s.series;
    const sections = (block?.sections ? String(block.sections) : undefined) ?? s.sections;
    const construction =
      (block?.buildingMethodValue ? String(block.buildingMethodValue) : undefined) ?? s.buildingMethod;
    const name =
      ref.name ||
      (block?.displayName as string | undefined)?.trim() ||
      canonicalName(String(block?.modelName ?? 'Cavco model'), modelCode);

    // Prefer the detail page's structured albums (classified, larger renditions);
    // fall back to the ~644px images carried on the search hit.
    let photos = block
      ? buildPhotos(name, albumImages(docs, block.photos), albumImages(docs, block.lineDrawings))
      : [];
    if (photos.length === 0) {
      photos = buildPhotos(
        name,
        s.photos.map((p) => ({ url: p.url, imageType: 'Photo', alt: p.alt })),
        s.lineDrawings.map((p) => ({ url: p.url, imageType: 'Line Drawing', alt: p.alt })),
      );
    }

    const specBits = [
      beds != null ? `${beds} bd` : null,
      baths != null ? `${baths} ba` : null,
      sqft != null ? `${sqft.toLocaleString()} sq ft` : null,
    ].filter(Boolean);
    const headline = specBits.length ? `${name} — ${specBits.join(' / ')}` : undefined;
    const blockDescription = block?.description ? String(block.description).trim() : '';
    const description =
      blockDescription ||
      [
        `${name} is a ${sections ? sections.toLowerCase() : 'manufactured'} home`,
        specBits.length ? `with ${specBits.join(', ')}` : null,
        series ? `from Cavco's ${series} series` : null,
        s.centerName ? `built at ${s.centerName}` : null,
      ]
        .filter(Boolean)
        .join(' ') + '.';

    return {
      name,
      modelCode,
      series,
      type: homeType(sections, construction, widthFt),
      beds,
      baths,
      sqft,
      widthFt,
      lengthFt,
      construction,
      headline,
      description,
      sourceUrl: ref.detailUrl,
      photos,
    };
  },
};

export default adapter;
