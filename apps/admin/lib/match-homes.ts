/**
 * Pure inventory matcher for the lead CRM.
 *
 * Scores already-loaded homes against a lead's saved buyer requirements
 * (lead_preferences). DB access stays in the caller (page.tsx / the server
 * action) so this stays pure + testable; here we only rank and explain.
 *
 * Score = (criteria satisfied) / (criteria specified), over the STRUCTURED
 * criteria only (type, manufacturer, beds, baths, sqft, dimensions, year,
 * price). BUDGET is additionally a HARD filter: homes priced outside the lead's
 * range — or with no price set — are excluded from the results, not merely
 * scored down (a home the customer can't afford isn't a match). Must-have
 * *features* are a soft signal — there's no structured feature column on homes,
 * so we text-match them against the listing copy and surface ✓/✗ chips, but
 * they never filter a home out or change the score.
 */

import type { HomeType, LeadPreferences } from '@uhs/db';

export type MatchableHome = {
  id: string;
  name: string;
  stock_no: string;
  type: HomeType;
  manufacturer_id: string | null;
  model: string | null;
  beds: number | null;
  beds_options: number[] | null;
  baths: number | null;
  baths_options: number[] | null;
  sqft: number | null;
  width_ft: number | null;
  length_ft: number | null;
  year_built: number | null;
  listed_price_cents: number | null;
  headline: string | null;
  description: string | null;
};

export type HomeMatch = {
  home: MatchableHome;
  /** 0..1 across the criteria the lead actually specified (1 when none). */
  score: number;
  /** Count of specified structured criteria (0 when the lead set none). */
  criteriaCount: number;
  matched: string[];
  missed: string[];
  matchedFeatures: string[];
  missedFeatures: string[];
};

/** True when `value` falls within [min, max]; a null bound is open-ended. */
function inRange(value: number | null | undefined, min: number | null, max: number | null): boolean {
  if (value == null) return false; // can't confirm an unknown spec satisfies a constraint
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

/** Beds/baths can be offered as alternate configs; any candidate in range wins. */
function anyInRange(candidates: Array<number | null | undefined>, min: number | null, max: number | null): boolean {
  return candidates.some((c) => inRange(c, min, max));
}

/** Soft feature check: phrase match, else every significant word present. */
function textHasFeature(haystack: string, feature: string): boolean {
  const hay = haystack.toLowerCase();
  const f = feature.trim().toLowerCase();
  if (!f) return false;
  if (hay.includes(f)) return true;
  const words = f.split(/\s+/).filter((w) => w.length > 2);
  return words.length > 0 && words.every((w) => hay.includes(w));
}

export function scoreHome(prefs: LeadPreferences, home: MatchableHome): HomeMatch {
  const matched: string[] = [];
  const missed: string[] = [];

  const consider = (specified: boolean, label: string, ok: boolean) => {
    if (!specified) return;
    (ok ? matched : missed).push(label);
  };

  consider(
    !!prefs.preferred_types?.length,
    'Type',
    !!prefs.preferred_types?.includes(home.type),
  );
  consider(
    !!prefs.manufacturer_ids?.length,
    'Manufacturer',
    !!(home.manufacturer_id && prefs.manufacturer_ids?.includes(home.manufacturer_id)),
  );
  consider(
    !!prefs.preferred_models?.length,
    'Model',
    !!(home.model &&
      prefs.preferred_models?.some((m) => {
        const a = home.model!.toLowerCase();
        const b = m.toLowerCase();
        return a.includes(b) || b.includes(a);
      })),
  );
  consider(
    prefs.min_beds != null || prefs.max_beds != null,
    'Beds',
    anyInRange([home.beds, ...(home.beds_options ?? [])], prefs.min_beds, prefs.max_beds),
  );
  consider(
    prefs.min_baths != null || prefs.max_baths != null,
    'Baths',
    anyInRange([home.baths, ...(home.baths_options ?? [])], prefs.min_baths, prefs.max_baths),
  );
  consider(
    prefs.min_sqft != null || prefs.max_sqft != null,
    'Sq ft',
    inRange(home.sqft, prefs.min_sqft, prefs.max_sqft),
  );
  consider(
    prefs.min_width_ft != null || prefs.max_width_ft != null,
    'Width',
    inRange(home.width_ft, prefs.min_width_ft, prefs.max_width_ft),
  );
  consider(
    prefs.min_length_ft != null || prefs.max_length_ft != null,
    'Length',
    inRange(home.length_ft, prefs.min_length_ft, prefs.max_length_ft),
  );
  consider(
    prefs.min_year != null || prefs.max_year != null,
    'Year',
    inRange(home.year_built, prefs.min_year, prefs.max_year),
  );
  consider(
    prefs.min_price_cents != null || prefs.max_price_cents != null,
    'Price',
    inRange(home.listed_price_cents, prefs.min_price_cents, prefs.max_price_cents),
  );

  // Must-have features — soft text signal only.
  const haystack = [home.name, home.model, home.headline, home.description].filter(Boolean).join(' ');
  const matchedFeatures: string[] = [];
  const missedFeatures: string[] = [];
  for (const feat of prefs.must_have_features ?? []) {
    (textHasFeature(haystack, feat) ? matchedFeatures : missedFeatures).push(feat);
  }

  const criteriaCount = matched.length + missed.length;
  const score = criteriaCount === 0 ? 1 : matched.length / criteriaCount;

  return { home, score, criteriaCount, matched, missed, matchedFeatures, missedFeatures };
}

/**
 * Rank homes against a lead's requirements, best first. Ties break toward more
 * matched must-have features, then cheaper, then name — all deterministic.
 */
export function matchHomes(prefs: LeadPreferences, homes: MatchableHome[]): HomeMatch[] {
  // Budget is a HARD filter: when the lead specifies a price range, only homes
  // whose listed price falls inside it survive. Unpriced homes (null/0) can't be
  // confirmed affordable, so they're excluded too. Every other criterion stays a
  // soft signal (scored, with ✓/✗ chips).
  const hasBudget = prefs.min_price_cents != null || prefs.max_price_cents != null;
  return homes
    .filter((h) => !hasBudget || inRange(h.listed_price_cents, prefs.min_price_cents, prefs.max_price_cents))
    .map((h) => scoreHome(prefs, h))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.matchedFeatures.length !== a.matchedFeatures.length) {
        return b.matchedFeatures.length - a.matchedFeatures.length;
      }
      const pa = a.home.listed_price_cents ?? Number.MAX_SAFE_INTEGER;
      const pb = b.home.listed_price_cents ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return a.home.name.localeCompare(b.home.name);
    });
}
