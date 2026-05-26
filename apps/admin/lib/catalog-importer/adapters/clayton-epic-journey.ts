// Clayton Epic Journey — manufacturer 'clayton-built'.
// Listing URL: https://claytonepicjourney.com/homes/?region={N}
// Detail URL: https://claytonepicjourney.com/models/{code}/
// Photos: https://api.claytonhomes.com/images/mfg/{ext|int|flp}/{uuid}.jpg

import * as cheerio from 'cheerio';
import { fetchText } from '../framework';
import type { CatalogAdapter, ModelData, ModelPhoto, ModelRef } from '../types';

const HOST = 'claytonepicjourney.com';
const SERIES = 'Clayton Epic Journey';
const CONSTRUCTION = 'Clayton Built';

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

const adapter: CatalogAdapter = {
  slug: 'clayton-epic-journey',
  displayName: 'Clayton Epic Journey',
  manufacturerSlug: 'clayton-built',
  crawlDelayMs: 10_000,

  matches(url: string): boolean {
    try {
      return new URL(url).hostname.endsWith(HOST);
    } catch {
      return false;
    }
  },

  async listModels({ url }) {
    // Accept either /homes/?region=N (canonical) or the bare site URL (defaults
    // to region=3 since that's South — the dealer's market).
    let listingUrl = url;
    try {
      const u = new URL(url);
      if (!u.pathname.startsWith('/homes')) {
        u.pathname = '/homes/';
        if (!u.searchParams.has('region')) u.searchParams.set('region', '3');
        listingUrl = u.toString();
      }
    } catch {
      // pass through whatever was given
    }
    const html = await fetchText(listingUrl);
    const $ = cheerio.load(html);
    const refs: ModelRef[] = [];
    $('.model-card').each((_: number, el: any) => {
      const card = $(el);
      const link = card.find('a[href*="/models/"]').first();
      const href = link.attr('href');
      if (!href) return;
      const detailUrl = href.startsWith('http') ? href : `https://${HOST}${href}`;
      const text = card.text().replace(/\s+/g, ' ').trim();
      const nameMatch = text.match(/\b([A-Z]{3,})\b/);
      if (!nameMatch || nameMatch[1] === 'VIEW') return;
      const name = nameMatch[1]!;
      if (!refs.find((r) => r.detailUrl === detailUrl)) {
        refs.push({ name, detailUrl });
      }
    });
    return refs;
  },

  async fetchModel(ref) {
    const html = await fetchText(ref.detailUrl);
    const $ = cheerio.load(html);
    const bodyText = $('body').text().replace(/\s+/g, ' ');

    const beds = num(bodyText.match(/(\d+)\s*(?:bed|bedroom)s?\b/i)?.[1]);
    const baths = num(bodyText.match(/(\d+(?:\.\d+)?)\s*(?:bath|bathroom)s?\b/i)?.[1]);
    const sqft = num(bodyText.match(/([\d,]{3,})\s*sq\.?\s*ft/i)?.[1]);
    const dim = bodyText.match(/(\d{2})\s*[x×]\s*(\d{2,3})/);
    const widthFt = num(dim?.[1]);
    const lengthFt = num(dim?.[2]);

    const codeMatch = ref.detailUrl.match(/\/models\/([a-z0-9]+)\/?$/i);
    const modelCode = codeMatch ? codeMatch[1]!.toUpperCase() : undefined;

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

    return {
      name: ref.name as string,
      modelCode,
      series: SERIES,
      type: typeFromWidth(widthFt),
      beds,
      baths,
      sqft,
      widthFt,
      lengthFt,
      yearBuilt,
      construction: CONSTRUCTION,
      description,
      sourceUrl: ref.detailUrl,
      photos,
    };
  },
};

export default adapter;
