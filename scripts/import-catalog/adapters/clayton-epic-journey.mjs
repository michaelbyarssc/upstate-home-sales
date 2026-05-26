// Adapter for https://claytonepicjourney.com — the Clayton Epic Journey series.
// Manufacturer: 'clayton-built' (already seeded in the manufacturers table).
// Discovery: /homes/?region={N} lists models for a US region.
// Detail:    /models/{code}/ — exposes spec text + photos hosted on api.claytonhomes.com.

import * as cheerio from 'cheerio';
import { fetchText } from '../framework.mjs';

const BASE = 'https://claytonepicjourney.com';

const SERIES = 'Clayton Epic Journey';
const CONSTRUCTION = 'Clayton Built';

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

// Extract every photo URL pointing at api.claytonhomes.com/images/mfg/{kind}/...
// from the raw HTML. The detail page has a JS gallery but the underlying URLs
// are present in the HTML source, so we don't need a real browser.
function extractPhotoUrls(html) {
  // Match the full URL including any query string. Dedupe by UUID.
  const re = /https:\/\/api\.claytonhomes\.com\/images\/mfg\/(ext|int|flp)\/([a-f0-9-]+)\.jpg/gi;
  const seen = new Map(); // uuid → { kind, url }
  let m;
  while ((m = re.exec(html)) !== null) {
    const kind = m[1].toLowerCase();
    const uuid = m[2].toLowerCase();
    if (!seen.has(uuid)) {
      // Request the 1600px variant — same trick the old import-clayton-models.mjs used.
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

export default {
  slug: 'clayton-epic-journey',
  displayName: 'Clayton Epic Journey',
  manufacturerSlug: 'clayton-built',
  crawlDelayMs: 10_000, // honor robots.txt

  async listModels({ region = '3' } = {}) {
    const url = `${BASE}/homes/?region=${encodeURIComponent(region)}`;
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const refs = [];
    // Each card has class .model-card; the model name is the first uppercase
    // token in the card's text (e.g. "LEWIS 2 beds • 2 baths • …").
    $('.model-card').each((_, el) => {
      const card = $(el);
      const link = card.find('a[href*="/models/"]').first();
      const href = link.attr('href');
      if (!href) return;
      const detailUrl = href.startsWith('http') ? href : `${BASE}${href}`;
      const text = card.text().replace(/\s+/g, ' ').trim();
      const m = text.match(/\b([A-Z]{3,})\b/);
      if (!m) return;
      const name = m[1];
      if (name === 'VIEW') return; // safety — should never hit since VIEW comes after the real name
      if (!refs.find((r) => r.detailUrl === detailUrl)) {
        refs.push({ name, detailUrl });
      }
    });
    return refs;
  },

  async fetchModel(ref) {
    const html = await fetchText(ref.detailUrl);
    const $ = cheerio.load(html);

    // Spec strings on Clayton's page look like "4 bed", "3 bath", "2,001 sq ft", "28x76".
    // Use a normalized lowercase body text for regex extraction; fall back gracefully.
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
    const dims = (() => {
      const m = bodyText.match(/(\d{2})\s*[x×]\s*(\d{2,3})/);
      return m ? { width: parseInt0(m[1]), length: parseInt0(m[2]) } : { width: undefined, length: undefined };
    })();

    // Model code is the last URL segment ('30cej28764ah'), uppercased.
    const codeMatch = ref.detailUrl.match(/\/models\/([a-z0-9]+)\/?$/i);
    const modelCode = codeMatch ? codeMatch[1].toUpperCase() : undefined;

    // Year: try the brochure footer ("03-12-26") or page copyright; default unset so admin can fill.
    const yearMatch = bodyText.match(/\b(20\d{2})\b/g);
    const yearBuilt = yearMatch ? parseInt0(yearMatch[yearMatch.length - 1]) : undefined;

    // Description: first paragraph under the spec block, if any. Clayton's pages
    // are spec-only sometimes — leave description empty in that case rather than guess.
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

    return {
      name: ref.name,
      modelCode,
      series: SERIES,
      type: typeFromWidth(dims.width),
      beds,
      baths,
      sqft,
      widthFt: dims.width,
      lengthFt: dims.length,
      yearBuilt,
      construction: CONSTRUCTION,
      headline: undefined,
      description,
      sourceUrl: ref.detailUrl,
      photos,
    };
  },
};
