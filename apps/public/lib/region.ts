/**
 * SC region helpers — Phase F (multi-location + region pricing).
 *
 * The middleware sets `x-buyer-region` from the buyer's zip cookie. RSC
 * routes and the lead-intake API use these helpers to resolve the zip into
 * county + state, which the regional-pricing RPC then matches against.
 *
 * Coverage notes:
 *   - The bundled SC zip→county map starts with the 10 highest MH-density
 *     counties (matches the Phase E.2 import target list). A buyer in an
 *     un-mapped zip just doesn't get a county-level price override, but
 *     state-level + zip-level overrides still work.
 *   - To expand coverage, replace `SC_ZIP_TO_COUNTY` with a full ZCTA-derived
 *     dataset (e.g., from US Census Bureau's ZCTA→county relationship file).
 *     The shape doesn't change.
 *
 * No PII flows through these helpers — zip + county are demographic, not
 * personally identifying.
 */

export type RegionContext = {
  zip: string | null;
  county: string | null;
  state: string;
};

/** Default state when the buyer hasn't provided a zip yet. */
export const DEFAULT_STATE = 'SC';

/** Header name set by middleware and read by RSC. */
export const BUYER_REGION_HEADER = 'x-buyer-region';

/** Cookie name used by the public site to remember the buyer's zip. */
export const BUYER_ZIP_COOKIE = 'uhs_buyer_zip';

/** Partial SC zip → county map. Covers the top-10 MH-density counties.
 *  Expand by appending more entries; key = 5-digit zip, value = county name
 *  (without "County" suffix). */
const SC_ZIP_TO_COUNTY: Record<string, string> = {
  // Lexington
  '29073': 'Lexington', '29070': 'Lexington', '29071': 'Lexington', '29072': 'Lexington',
  '29053': 'Lexington', '29054': 'Lexington', '29063': 'Lexington', '29070-01': 'Lexington',
  // Spartanburg
  '29301': 'Spartanburg', '29302': 'Spartanburg', '29303': 'Spartanburg', '29304': 'Spartanburg',
  '29306': 'Spartanburg', '29307': 'Spartanburg', '29316': 'Spartanburg', '29320': 'Spartanburg',
  '29329': 'Spartanburg', '29330': 'Spartanburg', '29334': 'Spartanburg', '29349': 'Spartanburg',
  '29365': 'Spartanburg', '29369': 'Spartanburg', '29372': 'Spartanburg', '29385': 'Spartanburg',
  // Anderson
  '29621': 'Anderson', '29622': 'Anderson', '29624': 'Anderson', '29625': 'Anderson',
  '29626': 'Anderson', '29627': 'Anderson', '29628': 'Anderson', '29630': 'Anderson',
  '29644': 'Anderson', '29654': 'Anderson', '29655': 'Anderson', '29659': 'Anderson',
  '29667': 'Anderson', '29669': 'Anderson', '29670': 'Anderson', '29671': 'Anderson',
  '29697': 'Anderson',
  // York
  '29710': 'York', '29714': 'York', '29715': 'York', '29716': 'York',
  '29717': 'York', '29726': 'York', '29730': 'York', '29732': 'York',
  '29733': 'York', '29734': 'York', '29742': 'York', '29744': 'York',
  '29745': 'York',
  // Greenville (29644 also touches Anderson; 29661/29669 touch Pickens —
  // we keep them as Greenville since population-weighted that's where most
  // mail volume lives.)
  '29601': 'Greenville', '29602': 'Greenville', '29603': 'Greenville', '29604': 'Greenville',
  '29605': 'Greenville', '29606': 'Greenville', '29607': 'Greenville', '29609': 'Greenville',
  '29611': 'Greenville', '29615': 'Greenville', '29616': 'Greenville', '29617': 'Greenville',
  '29650': 'Greenville', '29651': 'Greenville', '29652': 'Greenville',
  '29661': 'Greenville', '29662': 'Greenville', '29673': 'Greenville',
  '29680': 'Greenville', '29681': 'Greenville', '29683': 'Greenville', '29687': 'Greenville',
  '29688': 'Greenville', '29690': 'Greenville',
  // Pickens (29635/29657 also touch Oconee; 29667/29671/29682 touch Anderson)
  '29640': 'Pickens', '29642': 'Pickens',
  '29685': 'Pickens', '29686': 'Pickens',
  // Cherokee
  '29323': 'Cherokee', '29336': 'Cherokee', '29338': 'Cherokee', '29341': 'Cherokee',
  '29702': 'Cherokee', '29703': 'Cherokee',
  // Oconee
  '29635': 'Oconee', '29638': 'Oconee', '29657': 'Oconee', '29664': 'Oconee',
  '29665': 'Oconee', '29672': 'Oconee', '29675': 'Oconee', '29676': 'Oconee',
  '29678': 'Oconee', '29679': 'Oconee', '29689': 'Oconee',
  '29691': 'Oconee', '29693': 'Oconee', '29696': 'Oconee',
  // Aiken
  '29801': 'Aiken', '29802': 'Aiken', '29803': 'Aiken', '29804': 'Aiken',
  '29805': 'Aiken', '29808': 'Aiken', '29809': 'Aiken', '29816': 'Aiken',
  '29829': 'Aiken', '29831': 'Aiken', '29834': 'Aiken', '29840': 'Aiken',
  '29850': 'Aiken', '29856': 'Aiken', '29860': 'Aiken',
  // Sumter
  '29150': 'Sumter', '29151': 'Sumter', '29152': 'Sumter', '29153': 'Sumter',
  '29154': 'Sumter',
};

/** Resolve a zip code to county + state. Returns null county for un-mapped zips. */
export function regionFromZip(zip: string | null | undefined): RegionContext {
  if (!zip) return { zip: null, county: null, state: DEFAULT_STATE };
  const cleaned = zip.replace(/[^0-9]/g, '').slice(0, 5);
  if (cleaned.length !== 5) return { zip: null, county: null, state: DEFAULT_STATE };
  return {
    zip: cleaned,
    county: SC_ZIP_TO_COUNTY[cleaned] ?? null,
    state: DEFAULT_STATE,
  };
}

/** Encode a region for the x-buyer-region header (and decode on the other side). */
export function encodeRegion(r: RegionContext): string {
  return JSON.stringify({ z: r.zip, c: r.county, s: r.state });
}

export function decodeRegion(headerValue: string | null | undefined): RegionContext | null {
  if (!headerValue) return null;
  try {
    const parsed = JSON.parse(headerValue) as { z?: string | null; c?: string | null; s?: string };
    return {
      zip: parsed.z ?? null,
      county: parsed.c ?? null,
      state: parsed.s ?? DEFAULT_STATE,
    };
  } catch {
    return null;
  }
}

/** Haversine distance between two lat/lng pairs, in miles. Used for
 *  nearest-location lead routing. */
export function distanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.8; // Earth radius in miles.
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
