/**
 * Deterministic search-query parser for the public inventory page.
 * Pure function — no I/O, no async. Replaces the previous LLM-backed
 * /api/ai/parse-search behavior so common shopper phrases ("3/2",
 * "Clayton double under 80k", "1500+ sqft") map to structured filters
 * without a model round-trip.
 */

export type ParsedSearch = {
  beds?: number;
  baths?: number;
  type?: 'single' | 'double' | 'modular';
  mfr?: string;
  min_price?: number;
  max_price?: number;
  min_sqft?: number;
  max_sqft?: number;
  q?: string;
};

type Manufacturer = { slug: string; name: string };

function parsePriceToken(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '').toLowerCase();
  if (!cleaned) return null;
  if (cleaned.endsWith('k')) {
    const n = parseFloat(cleaned.slice(0, -1));
    return Number.isFinite(n) ? Math.round(n * 1000) : null;
  }
  if (cleaned.endsWith('m')) {
    const n = parseFloat(cleaned.slice(0, -1));
    return Number.isFinite(n) ? Math.round(n * 1_000_000) : null;
  }
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseSqftToken(raw: string): number | null {
  const n = parseInt(raw.replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseSearchQuery(text: string, manufacturers: Manufacturer[]): ParsedSearch {
  const result: ParsedSearch = {};
  let remaining = ` ${text.trim()} `;

  function consume(re: RegExp): RegExpMatchArray | null {
    const m = remaining.match(re);
    if (m) remaining = remaining.replace(re, ' ');
    return m;
  }

  // 1. Beds/baths shorthand — "3/2", "3-2", "3x2", "3br/2ba", "3 br / 2 ba".
  //    Both numbers must be 1–6 so we don't swallow "28-76" dimensions.
  const shorthand = consume(
    /\b([1-6])\s*(?:br|bd|bed)?\s*[\/\-x]\s*([1-6](?:\.5)?)\s*(?:ba|bd|bath)?\b/i,
  );
  if (shorthand) {
    result.beds = parseInt(shorthand[1]!, 10);
    result.baths = parseFloat(shorthand[2]!);
  }

  // 2. Beds — "3 bed", "3 beds", "3 bedroom(s)", "3br", "3bd".
  if (result.beds == null) {
    const m = consume(/\b([1-9])\s*(?:bed(?:room)?s?|br|bd)\b/i);
    if (m) result.beds = parseInt(m[1]!, 10);
  }

  // 3. Baths — "2 bath", "2.5 baths", "2 bathroom(s)", "2ba". Allows .5.
  if (result.baths == null) {
    const m = consume(/\b(\d(?:\.5)?)\s*(?:bath(?:room)?s?|ba)\b/i);
    if (m) result.baths = parseFloat(m[1]!);
  }

  // 4. Type. Match longest forms first ("single-wide" before "single" before "sw").
  if (consume(/\b(?:single[-\s]?wide|singlewide|single)\b/i)) result.type = 'single';
  else if (consume(/\b(?:double[-\s]?wide|doublewide|double)\b/i)) result.type = 'double';
  else if (consume(/\bmodular\b/i)) result.type = 'modular';
  else if (consume(/\bsw\b/i)) result.type = 'single';
  else if (consume(/\bdw\b/i)) result.type = 'double';

  // 5. Sqft. Run before price so "1500 sqft" isn't mistaken for a bare price token.
  const sqftRange = consume(
    /\b(\d{3,5}(?:,\d{3})?)\s*(?:-|to)\s*(\d{3,5}(?:,\d{3})?)\s*(?:sq\.?\s*ft\.?|sqft|square\s*feet|sf)\b/i,
  );
  if (sqftRange) {
    result.min_sqft = parseSqftToken(sqftRange[1]!) ?? undefined;
    result.max_sqft = parseSqftToken(sqftRange[2]!) ?? undefined;
  }
  if (result.min_sqft == null) {
    const m =
      consume(
        /\b(?:over|more\s+than|above|at\s+least)\s+(\d{3,5}(?:,\d{3})?)\+?\s*(?:sq\.?\s*ft\.?|sqft|square\s*feet|sf)\b/i,
      ) ||
      consume(/\b(\d{3,5}(?:,\d{3})?)\s*\+\s*(?:sq\.?\s*ft\.?|sqft|square\s*feet|sf)\b/i);
    if (m) result.min_sqft = parseSqftToken(m[1]!) ?? undefined;
  }
  if (result.max_sqft == null) {
    const m = consume(
      /\b(?:under|less\s+than|below)\s+(\d{3,5}(?:,\d{3})?)\s*(?:sq\.?\s*ft\.?|sqft|square\s*feet|sf)\b/i,
    );
    if (m) result.max_sqft = parseSqftToken(m[1]!) ?? undefined;
  }
  if (result.min_sqft == null && result.max_sqft == null) {
    // Bare "1500 sqft" → treat as a min (buyer typically wants at least that).
    const m = consume(/\b(\d{3,5}(?:,\d{3})?)\s*(?:sq\.?\s*ft\.?|sqft|square\s*feet|sf)\b/i);
    if (m) result.min_sqft = parseSqftToken(m[1]!) ?? undefined;
  }

  // 6. Price — range first, then max/min, then bare, then "cheap".
  //    Use (?<=\s) to anchor at a whitespace boundary; the string is pre-padded
  //    with spaces above so this matches leading tokens too. Eating the optional
  //    leading `$` here avoids leaving stray `$` in the leftover text.
  const priceRange = consume(
    /(?<=\s)\$?(\d[\d,]*\.?\d*[km]?)\s*(?:-|to)\s*\$?(\d[\d,]*\.?\d*[km]?)(?=\s|$)/i,
  );
  if (priceRange) {
    const lo = parsePriceToken(priceRange[1]!);
    const hi = parsePriceToken(priceRange[2]!);
    // Sanity: ignore if either side looks like a year or 1–2 digit count.
    if (lo != null && hi != null && lo >= 1000 && hi >= 1000 && lo <= hi) {
      result.min_price = lo;
      result.max_price = hi;
    }
  }
  if (result.max_price == null) {
    const m = consume(/\b(?:under|less\s+than|below|<\s*)\s*(\$?\d[\d,]*\.?\d*[km]?)\b/i);
    if (m) {
      const n = parsePriceToken(m[1]!);
      if (n != null && n >= 1000) result.max_price = n;
    }
  }
  if (result.min_price == null) {
    const m = consume(
      /\b(?:over|more\s+than|above|at\s+least|>\s*)\s*(\$?\d[\d,]*\.?\d*[km]?)\b/i,
    );
    if (m) {
      const n = parsePriceToken(m[1]!);
      if (n != null && n >= 1000) result.min_price = n;
    }
  }
  if (result.max_price == null && result.min_price == null) {
    // Bare "$120k" or "80k" with no qualifier → interpret as "up to" (buyer's ceiling).
    const m = consume(/(\$\s*\d[\d,]*\.?\d*[km]?|\b\d[\d,]*[km]\b)/i);
    if (m) {
      const n = parsePriceToken(m[0]!);
      if (n != null && n >= 1000) result.max_price = n;
    }
  }
  if (result.max_price == null && consume(/\b(?:cheap|affordable)\b/i)) {
    result.max_price = 60000;
  }

  // 7. Manufacturer — match against the live list. Try the full name first,
  //    then a "primary" name with common brand suffixes stripped
  //    ("Clayton Built" → match either "Clayton Built" or "Clayton"), then slug.
  const SUFFIX_RE = /\s+(?:built|homes?|manufactured|manufacturing|inc|llc|industries|mfg)\.?$/i;
  for (const m of manufacturers) {
    const name = m.name.trim();
    if (!name) continue;
    const nameRe = new RegExp(`\\b${escapeRegExp(name).replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (consume(nameRe)) {
      result.mfr = m.slug;
      break;
    }
    const primary = name.replace(SUFFIX_RE, '').trim();
    if (primary && primary !== name && primary.length >= 4) {
      const primaryRe = new RegExp(`\\b${escapeRegExp(primary).replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (consume(primaryRe)) {
        result.mfr = m.slug;
        break;
      }
    }
    if (m.slug && m.slug.length >= 3) {
      const slugRe = new RegExp(`\\b${escapeRegExp(m.slug)}\\b`, 'i');
      if (consume(slugRe)) {
        result.mfr = m.slug;
        break;
      }
    }
  }

  // 8. Leftover → q for ILIKE on name/model. Strip standalone punctuation
  //    that the structured matchers may have left behind ($ from a price range,
  //    + from "1500+", etc.) so we don't ILIKE against meaningless tokens.
  const leftover = remaining
    .replace(/(?<=^|\s)[$+<>](?=\s|$)/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (leftover) result.q = leftover;

  return result;
}
