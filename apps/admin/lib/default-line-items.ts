import type { LineItem } from '@uhs/db';

type HomeForLineItems = {
  name: string;
  stock_no: string;
  listed_price_cents: number;
  setup_cents: number | null;
  setup_markup_pct: number | null;
  include_setup_in_price: boolean | null;
  addons_cents: number | null;
  addons_markup_pct: number | null;
};

/**
 * Build a default set of line items from a home's pricing fields.
 * The listed_price_cents is a generated column that already includes
 * base + markup + addons + setup. We present it as a single turn-key
 * line item, with standard inclusions listed without prices.
 */
export function buildDefaultLineItems(home: HomeForLineItems): LineItem[] {
  const items: LineItem[] = [
    {
      description: `${home.name} (${home.stock_no}) — Complete Turn-Key Package`,
      amount_cents: home.listed_price_cents,
    },
  ];

  // Standard inclusions — listed but not individually priced
  const inclusions = [
    'Shipping & Delivery',
    'Setup & Installation',
    'Standard Porches (4 ft x 4 ft)',
    'Septic System',
    'Power Pole & Hookup',
    'Sewer & Water Hook-Up',
    'Water Line (meter to home)',
    'Underpinning',
    'HVAC Unit',
  ];

  for (const desc of inclusions) {
    items.push({ description: desc, amount_cents: null });
  }

  return items;
}

/**
 * Sum all line items that have a price.
 */
export function sumLineItems(items: LineItem[]): number {
  return items.reduce((sum, item) => sum + (item.amount_cents ?? 0), 0);
}
