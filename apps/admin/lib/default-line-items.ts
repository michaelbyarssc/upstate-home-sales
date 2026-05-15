import type { HomeAddon, LineItem } from '@uhs/db';

type HomeForLineItems = {
  name: string;
  stock_no: string;
  listed_price_cents: number;
  setup_cents: number | null;
  setup_markup_pct: number | null;
  include_setup_in_price: boolean | null;
  addons_cents: number | null;
  addons_markup_pct: number | null;
  addons_jsonb: HomeAddon[] | unknown;
};

/**
 * Build a default set of line items from a home's pricing fields.
 * The listed_price_cents is a generated column that already includes
 * base + markup + addons + setup. We present it as a single turn-key
 * line item, with add-ons and standard inclusions listed without prices
 * (prices are hidden from the customer — only the total is shown).
 */
export function buildDefaultLineItems(home: HomeForLineItems): LineItem[] {
  const items: LineItem[] = [
    {
      description: 'Home',
      subtitle: `${home.name} (${home.stock_no})`,
      amount_cents: home.listed_price_cents,
    },
  ];

  // Pull itemized add-ons from the home — listed without prices
  const addons = Array.isArray(home.addons_jsonb) ? (home.addons_jsonb as HomeAddon[]) : [];
  for (const addon of addons) {
    if (addon.description?.trim()) {
      items.push({ description: addon.description, subtitle: null, amount_cents: null });
    }
  }

  // Standard inclusions — listed but not individually priced
  const inclusions: Array<{ description: string; subtitle: string }> = [
    { description: 'Shipping & Delivery', subtitle: 'Transport of the home to your land' },
    { description: 'Professional Setup', subtitle: 'Full setup and installation on your site' },
    { description: 'Porches', subtitle: '4ft x 4ft standard front and rear porches (larger sizes available by quote)' },
    { description: 'Septic System', subtitle: 'Complete septic system installation' },
    { description: 'Sewer & Water Hookup', subtitle: 'Connection of sewer and water lines to the home' },
    { description: 'Water Line', subtitle: 'Run water line from the meter to the home' },
    { description: 'Underpinning / Skirting', subtitle: 'Full skirting around the home\'s perimeter' },
    { description: 'HVAC', subtitle: 'Complete heating and air conditioning unit' },
  ];

  for (const item of inclusions) {
    items.push({ description: item.description, subtitle: item.subtitle, amount_cents: null });
  }

  return items;
}

/**
 * Sum all line items that have a price.
 */
export function sumLineItems(items: LineItem[]): number {
  return items.reduce((sum, item) => sum + (item.amount_cents ?? 0), 0);
}
