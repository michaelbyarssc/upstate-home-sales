// OwnTru — manufacturer 'trumh'. Same Clayton WordPress template.
// Lines: /model-lines/tru-origin/ (13 models), /model-lines/tru-mini/ (2 models)
// Photos: same api.claytonhomes.com CDN as Clayton Epic Journey.

import * as cheerio from 'cheerio';
import { fetchText } from '../framework';
import type { CatalogAdapter, ModelData, ModelPhoto, ModelRef } from '../types';

const HOST = 'owntru.com';

const LINES: Record<string, { path: string; series: string }> = {
  'tru-origin': { path: '/model-lines/tru-origin/', series: 'TRU Origin' },
  'tru-mini': { path: '/model-lines/tru-mini/', series: 'TRU Mini' },
};

function num(s: string | undefined): number | undefined {
  if (s == null) return undefined;
  const n = Number(s.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function typeFromWidth(widthFt: number | undefined): ModelData['type'] {
  if (!widthFt) return 'double';
  if (widthFt <= 16) return 'single';
  return 'double';
}

function parseTrtCode(code: string | undefined): {
  widthFt?: number;
  lengthFt?: number;
  beds?: number;
} {
  if (!code) return {};
  const m = code.toUpperCase().match(/^TRT(\d{2})(\d{2,3})(\d)\w*$/);
  if (!m) return {};
  return {
    widthFt: parseInt(m[1]!, 10),
    lengthFt: parseInt(m[2]!, 10),
    beds: parseInt(m[3]!, 10),
  };
}

const NAME_BLOCKLIST = new Set(['VIEW', 'NEW', 'TRU', 'BEDS', 'BATHS', 'BATH', 'BED', 'SQ', 'FT']);

function extractName(text: string): string | null {
  const upper = text.match(/\b([A-Z]{3,})\b/g) ?? [];
  for (const t of upper) if (!NAME_BLOCKLIST.has(t)) return t;
  const proper = text.match(/\b([A-Z][a-z]{2,})\b/g) ?? [];
  for (const t of proper) if (!NAME_BLOCKLIST.has(t.toUpperCase())) return t;
  return null;
}

function classifyKind(kind: string): ModelPhoto['kind'] {
  if (kind === 'ext') return 'exterior';
  if (kind === 'int') return 'interior';
  return 'floorplan';
}

function extractPhotos(html: string): Array<{ kind: 'ext' | 'int' | 'flp'; url: string }> {
  const re = /https:\/\/api\.claytonhomes\.com\/images\/mfg\/(ext|int|flp)\/([a-f0-9-]+)\.jpg/gi;
  const seen = new Map<string, { kind: 'ext' | 'int' | 'flp'; url: string }>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const kind = m[1]!.toLowerCase() as 'ext' | 'int' | 'flp';
    const uuid = m[2]!.toLowerCase();
    if (!seen.has(uuid)) {
      seen.set(uuid, { kind, url: `https://api.claytonhomes.com/images/mfg/${kind}/${uuid}.jpg?width=1600` });
    }
  }
  const order = { ext: 0, int: 1, flp: 2 } as const;
  return [...seen.values()].sort((a, b) => order[a.kind] - order[b.kind]);
}

async function listOneLine(lineKey: string): Promise<ModelRef[]> {
  const line = LINES[lineKey];
  if (!line) throw new Error(`OwnTru: unknown line "${lineKey}"`);
  const html = await fetchText(`https://${HOST}${line.path}`);
  const $ = cheerio.load(html);
  const refs: ModelRef[] = [];
  $('.model-card').each((_: number, el: any) => {
    const card = $(el);
    const link = card.find('a[href*="/models/"]').first();
    const href = link.attr('href');
    if (!href) return;
    const detailUrl = href.startsWith('http') ? href : `https://${HOST}${href}`;
    const text = card.text().replace(/\s+/g, ' ').trim();
    const name = extractName(text);
    if (!name) return;
    if (!refs.find((r) => r.detailUrl === detailUrl)) {
      refs.push({ name, detailUrl, line: lineKey });
    }
  });
  return refs;
}

const adapter: CatalogAdapter = {
  slug: 'owntru',
  displayName: 'OwnTru (TruMH)',
  manufacturerSlug: 'trumh',
  crawlDelayMs: 10_000,

  matches(url: string): boolean {
    try {
      return new URL(url).hostname.endsWith(HOST);
    } catch {
      return false;
    }
  },

  async listModels({ url }) {
    // /model-lines/{slug}/ → just that line; anything else → all lines.
    let wantedLines: string[] = Object.keys(LINES);
    try {
      const path = new URL(url).pathname;
      const m = path.match(/\/model-lines\/([^/]+)\/?/);
      if (m && LINES[m[1]!]) wantedLines = [m[1]!];
    } catch {
      // fall through to all
    }
    const refs: ModelRef[] = [];
    for (const key of wantedLines) {
      refs.push(...(await listOneLine(key)));
    }
    return refs;
  },

  async fetchModel(ref) {
    const html = await fetchText(ref.detailUrl);
    const $ = cheerio.load(html);
    const bodyText = $('body').text().replace(/\s+/g, ' ');

    const beds = num(bodyText.match(/(\d+)\s*(?:bed|bedroom)s?\b/i)?.[1]);
    const baths = num(bodyText.match(/(\d+(?:\.\d+)?)\s*(?:bath|bathroom)s?\b/i)?.[1]);
    const sqft = num(bodyText.match(/([\d,]{3,})\s*sq\.?\s*ft/i)?.[1]);
    const dimFromBody = bodyText.match(/(\d{2})\s*[x×]\s*(\d{2,3})/);
    const widthFromBody = num(dimFromBody?.[1]);
    const lengthFromBody = num(dimFromBody?.[2]);

    const codeMatch = ref.detailUrl.match(/\/models\/([a-z0-9]+)\/?$/i);
    const modelCode = codeMatch ? codeMatch[1]!.toUpperCase() : undefined;
    const fromCode = parseTrtCode(modelCode);

    const widthFt = widthFromBody ?? fromCode.widthFt;
    const lengthFt = lengthFromBody ?? fromCode.lengthFt;
    const bedsResolved = beds ?? fromCode.beds;

    const years = bodyText.match(/\b(20\d{2})\b/g);
    const yearBuilt = years ? num(years[years.length - 1]) : undefined;

    let description: string | undefined;
    $('p').each((_: number, p: any) => {
      if (description) return;
      const t = $(p).text().trim();
      if (t.length >= 60 && t.length <= 600 && !/cookie|privacy|copyright/i.test(t)) description = t;
    });

    const photoUrls = extractPhotos(html);
    const photos: ModelPhoto[] = photoUrls.map((p, i) => ({
      url: p.url,
      kind: classifyKind(p.kind),
      sortOrder: i,
      alt: `${ref.name as string} — ${classifyKind(p.kind)}`,
    }));

    const lineKey = (ref.line as string | undefined) ?? '';
    const series = LINES[lineKey]?.series;

    return {
      name: ref.name as string,
      modelCode,
      series,
      type: typeFromWidth(widthFt),
      beds: bedsResolved,
      baths,
      sqft,
      widthFt,
      lengthFt,
      yearBuilt,
      description,
      sourceUrl: ref.detailUrl,
      photos,
    };
  },
};

export default adapter;
