// Adapter for https://owntru.com — the TruMH (OwnTru) brand.
// Manufacturer: 'trumh' (already seeded).
// OwnTru is built on the same Clayton WordPress template, so the discovery
// + photo-extraction logic mirrors the clayton-epic-journey adapter. Two
// product lines are exposed: TRU Origin (13 models) and TRU Mini (2 models).
//
// CLI `--region` flag selects the line: `tru-origin`, `tru-mini`, or
// unset/`all` (default — both lines).

import * as cheerio from 'cheerio';
import { fetchText } from '../framework.mjs';

const BASE = 'https://owntru.com';

const LINES = {
  'tru-origin': { path: '/model-lines/tru-origin/', series: 'TRU Origin' },
  'tru-mini': { path: '/model-lines/tru-mini/', series: 'TRU Mini' },
};

function parseInt0(s) {
  const n = parseInt(String(s).replace(/[,\s]/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseFloat0(s) {
  const n = parseFloat(String(s).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function typeFromWidth(widthFt) {
  if (!widthFt) return 'double';
  if (widthFt <= 16) return 'single';
  if (widthFt >= 28) return 'double';
  return 'double';
}

// TRT{ww}{ll}{beds}{x}{tail} — e.g. TRT16763AH = 16x76, 3 bed.
// Returns { widthFt, lengthFt, beds } when the code fits the pattern.
function parseTrtCode(code) {
  if (!code) return {};
  const m = code.toUpperCase().match(/^TRT(\d{2})(\d{2,3})(\d)\w*$/);
  if (!m) return {};
  return {
    widthFt: parseInt(m[1], 10),
    lengthFt: parseInt(m[2], 10),
    beds: parseInt(m[3], 10),
  };
}

// Skip tokens used in card text that aren't the model name.
const NAME_BLOCKLIST = new Set([
  'VIEW', 'NEW', 'TRU', 'BEDS', 'BATHS', 'BATH', 'BED', 'SQ', 'FT',
]);

function extractName(text) {
  // Try uppercase first (matches Clayton-style "ASPEN"), fall back to
  // proper-case (matches TRU Mini's "Buttercup").
  const upper = text.match(/\b([A-Z]{3,})\b/g) ?? [];
  for (const t of upper) if (!NAME_BLOCKLIST.has(t)) return t;
  const proper = text.match(/\b([A-Z][a-z]{2,})\b/g) ?? [];
  for (const t of proper) if (!NAME_BLOCKLIST.has(t.toUpperCase())) return t;
  return null;
}

// Same as Clayton: pull every api.claytonhomes.com photo URL out of the
// raw HTML, dedupe by UUID, and sort exterior → interior → floorplan.
function extractPhotoUrls(html) {
  const re = /https:\/\/api\.claytonhomes\.com\/images\/mfg\/(ext|int|flp)\/([a-f0-9-]+)\.jpg/gi;
  const seen = new Map();
  let m;
  while ((m = re.exec(html)) !== null) {
    const kind = m[1].toLowerCase();
    const uuid = m[2].toLowerCase();
    if (!seen.has(uuid)) {
      const url = `https://api.claytonhomes.com/images/mfg/${kind}/${uuid}.jpg?width=1600`;
      seen.set(uuid, { kind, url });
    }
  }
  const order = { ext: 0, int: 1, flp: 2 };
  return [...seen.values()].sort((a, b) => order[a.kind] - order[b.kind]);
}

function classifyKind(kind) {
  if (kind === 'ext') return 'exterior';
  if (kind === 'int') return 'interior';
  return 'floorplan';
}

async function listOneLine(lineKey) {
  const line = LINES[lineKey];
  if (!line) throw new Error(`listOneLine: unknown line "${lineKey}"`);
  const html = await fetchText(`${BASE}${line.path}`);
  const $ = cheerio.load(html);
  const refs = [];
  $('.model-card').each((_, el) => {
    const card = $(el);
    const link = card.find('a[href*="/models/"]').first();
    const href = link.attr('href');
    if (!href) return;
    const detailUrl = href.startsWith('http') ? href : `${BASE}${href}`;
    const text = card.text().replace(/\s+/g, ' ').trim();
    const name = extractName(text);
    if (!name) return;
    if (!refs.find((r) => r.detailUrl === detailUrl)) {
      refs.push({ name, detailUrl, line: lineKey });
    }
  });
  return refs;
}

export default {
  slug: 'owntru',
  displayName: 'OwnTru (TruMH)',
  manufacturerSlug: 'trumh',
  crawlDelayMs: 10_000,

  async listModels({ region } = {}) {
    const want = !region || region === 'all' ? Object.keys(LINES) : [region];
    const refs = [];
    for (const lineKey of want) {
      const lineRefs = await listOneLine(lineKey);
      refs.push(...lineRefs);
    }
    return refs;
  },

  async fetchModel(ref) {
    const html = await fetchText(ref.detailUrl);
    const $ = cheerio.load(html);
    const bodyText = $('body').text().replace(/\s+/g, ' ');

    const beds = (() => {
      const m = bodyText.match(/(\d+)\s*(?:bed|bedroom)s?\b/i);
      return m ? parseInt0(m[1]) : undefined;
    })();
    const baths = (() => {
      const m = bodyText.match(/(\d+(?:\.\d+)?)\s*(?:bath|bathroom)s?\b/i);
      return m ? parseFloat0(m[1]) : undefined;
    })();
    const sqft = (() => {
      const m = bodyText.match(/([\d,]{3,})\s*sq\.?\s*ft/i);
      return m ? parseInt0(m[1]) : undefined;
    })();
    const dimsFromBody = (() => {
      const m = bodyText.match(/(\d{2})\s*[x×]\s*(\d{2,3})/);
      return m ? { widthFt: parseInt0(m[1]), lengthFt: parseInt0(m[2]) } : {};
    })();

    const codeMatch = ref.detailUrl.match(/\/models\/([a-z0-9]+)\/?$/i);
    const modelCode = codeMatch ? codeMatch[1].toUpperCase() : undefined;
    const dimsFromCode = parseTrtCode(modelCode);

    const widthFt = dimsFromBody.widthFt ?? dimsFromCode.widthFt;
    const lengthFt = dimsFromBody.lengthFt ?? dimsFromCode.lengthFt;
    const bedsResolved = beds ?? dimsFromCode.beds;

    const yearMatch = bodyText.match(/\b(20\d{2})\b/g);
    const yearBuilt = yearMatch ? parseInt0(yearMatch[yearMatch.length - 1]) : undefined;

    let description;
    $('p').each((_, p) => {
      if (description) return;
      const t = $(p).text().trim();
      if (t.length >= 60 && t.length <= 600 && !/cookie|privacy|copyright/i.test(t)) {
        description = t;
      }
    });

    const photoUrls = extractPhotoUrls(html);
    const photos = photoUrls.map((p, i) => ({
      url: p.url,
      kind: classifyKind(p.kind),
      sortOrder: i,
      alt: `${ref.name} — ${classifyKind(p.kind)}`,
    }));

    const series = ref.line && LINES[ref.line] ? LINES[ref.line].series : undefined;

    return {
      name: ref.name,
      modelCode,
      series,
      type: typeFromWidth(widthFt),
      beds: bedsResolved,
      baths,
      sqft,
      widthFt,
      lengthFt,
      yearBuilt,
      construction: undefined,
      headline: undefined,
      description,
      sourceUrl: ref.detailUrl,
      photos,
    };
  },
};
