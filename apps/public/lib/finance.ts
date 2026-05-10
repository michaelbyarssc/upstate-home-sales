/**
 * Quick monthly-payment estimator for inventory cards and detail pages.
 *
 * Defaults model a typical chattel loan on a manufactured home with the
 * minimum down payment most lenders accept:
 *   - 3.5% down
 *   - 7.0% APR
 *   - 20-year (240-month) term
 *
 * Kept in sync with the loan-calculator chattel preset so the inline
 * "$XXX/mo" on a card matches what a buyer sees on /financing.
 */

const DEFAULT_DOWN = 0.035;
const DEFAULT_APR = 0.07;
const DEFAULT_TERM_MONTHS = 240;

export type EstimateOpts = {
  downPct?: number;
  apr?: number;
  termMonths?: number;
};

export function monthlyPaymentCents(
  priceCents: number,
  opts: EstimateOpts = {},
): number {
  if (!priceCents || priceCents <= 0) return 0;
  const down = opts.downPct ?? DEFAULT_DOWN;
  const apr = opts.apr ?? DEFAULT_APR;
  const n = opts.termMonths ?? DEFAULT_TERM_MONTHS;

  const principal = priceCents * (1 - down);
  const r = apr / 12;
  if (r === 0) return Math.round(principal / n);

  const monthly = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return Math.round(monthly);
}

/** "$294/mo" — for inline display in cards. */
export function formatMonthly(priceCents: number, opts: EstimateOpts = {}): string {
  const m = monthlyPaymentCents(priceCents, opts);
  if (m <= 0) return '—';
  return `$${Math.round(m / 100).toLocaleString()}/mo`;
}

/** "$58K" — Trove-style compact total. Price expected in cents. */
export function formatCompactPrice(priceCents: number | null | undefined): string {
  if (priceCents == null || priceCents <= 0) return '—';
  const dollars = Math.round(priceCents / 100);
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000)}K`;
  return `$${dollars.toLocaleString()}`;
}
