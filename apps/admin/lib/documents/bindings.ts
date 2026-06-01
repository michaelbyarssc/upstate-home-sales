/**
 * Binding catalog + resolver for the document engine.
 *
 * A "binding" maps a template field to one of our data points (lead, home,
 * pricing, trade-in, dealer, or a computed value). This is a CLOSED set —
 * resolved by a hardcoded map, never dynamic SQL — which keeps it safe and lets
 * us snapshot exactly what each binding returned at generate time.
 *
 *   • BINDINGS        — the catalog the field-mapping UI offers (Phase 2).
 *   • resolveBinding  — turns a binding + a loaded data context into a frozen
 *                       { value, valueCents, display } for document_instances.snapshot_jsonb.
 *
 * The price snapshot lives in `valueCents`: the generate action reads
 * `home.listed_price_cents` ONCE here and freezes it; later markup changes can
 * never alter an already-generated document.
 */

import type { Lead, Buyer, Home, TradeIn, Org, LeadPreferences } from '@uhs/db';

export type BindingKey =
  // Lead (the inquiry contact)
  | 'lead.contact_name'
  | 'lead.email'
  | 'lead.phone'
  // Buyer (portal customer profile, when linked)
  | 'buyer.full_name'
  | 'buyer.email'
  | 'buyer.phone'
  // Home / unit
  | 'home.name'
  | 'home.stock_no'
  | 'home.model'
  | 'home.manufacturer'
  | 'home.year'
  | 'home.beds'
  | 'home.baths'
  | 'home.size'
  | 'home.sqft'
  // Pricing (snapshotted)
  | 'home.listed_price_cents'
  | 'quote.total_cents'
  // Trade-in
  | 'trade_in.year'
  | 'trade_in.make'
  | 'trade_in.model'
  | 'trade_in.offer_cents'
  // Requested (the buyer's criteria from the lead CRM — build-to-order)
  | 'requested.types'
  | 'requested.condition'
  | 'requested.manufacturers'
  | 'requested.colors'
  | 'requested.beds'
  | 'requested.baths'
  | 'requested.sqft'
  | 'requested.size'
  | 'requested.year'
  | 'requested.budget'
  | 'requested.must_have_features'
  | 'requested.timeline'
  | 'requested.notes'
  // Dealer
  | 'org.name'
  // Computed
  | 'today';

export type BindingKind = 'text' | 'currency' | 'date' | 'number';

export type BindingDef = {
  key: BindingKey;
  label: string;
  group: 'Customer' | 'Home' | 'Pricing' | 'Trade-in' | 'Requested' | 'Dealer' | 'Computed';
  kind: BindingKind;
};

/** The catalog shown in the field-mapping dropdown. */
export const BINDINGS: BindingDef[] = [
  { key: 'lead.contact_name', label: 'Customer name (lead)', group: 'Customer', kind: 'text' },
  { key: 'lead.email', label: 'Customer email (lead)', group: 'Customer', kind: 'text' },
  { key: 'lead.phone', label: 'Customer phone (lead)', group: 'Customer', kind: 'text' },
  { key: 'buyer.full_name', label: 'Customer name (portal)', group: 'Customer', kind: 'text' },
  { key: 'buyer.email', label: 'Customer email (portal)', group: 'Customer', kind: 'text' },
  { key: 'buyer.phone', label: 'Customer phone (portal)', group: 'Customer', kind: 'text' },
  { key: 'home.name', label: 'Home name', group: 'Home', kind: 'text' },
  { key: 'home.stock_no', label: 'Stock number', group: 'Home', kind: 'text' },
  { key: 'home.model', label: 'Model', group: 'Home', kind: 'text' },
  { key: 'home.manufacturer', label: 'Manufacturer', group: 'Home', kind: 'text' },
  { key: 'home.year', label: 'Year', group: 'Home', kind: 'number' },
  { key: 'home.beds', label: 'Bedrooms', group: 'Home', kind: 'number' },
  { key: 'home.baths', label: 'Bathrooms', group: 'Home', kind: 'number' },
  { key: 'home.size', label: 'Size (W×L)', group: 'Home', kind: 'text' },
  { key: 'home.sqft', label: 'Square feet', group: 'Home', kind: 'number' },
  { key: 'home.listed_price_cents', label: 'Listed price', group: 'Pricing', kind: 'currency' },
  { key: 'quote.total_cents', label: 'Quote total', group: 'Pricing', kind: 'currency' },
  { key: 'trade_in.year', label: 'Trade-in year', group: 'Trade-in', kind: 'number' },
  { key: 'trade_in.make', label: 'Trade-in make', group: 'Trade-in', kind: 'text' },
  { key: 'trade_in.model', label: 'Trade-in model', group: 'Trade-in', kind: 'text' },
  { key: 'trade_in.offer_cents', label: 'Trade-in allowance', group: 'Trade-in', kind: 'currency' },
  { key: 'requested.types', label: 'Requested type(s)', group: 'Requested', kind: 'text' },
  { key: 'requested.condition', label: 'Requested condition (new/used)', group: 'Requested', kind: 'text' },
  { key: 'requested.manufacturers', label: 'Requested manufacturer(s)', group: 'Requested', kind: 'text' },
  { key: 'requested.colors', label: 'Requested color(s)', group: 'Requested', kind: 'text' },
  { key: 'requested.beds', label: 'Requested bedrooms', group: 'Requested', kind: 'text' },
  { key: 'requested.baths', label: 'Requested bathrooms', group: 'Requested', kind: 'text' },
  { key: 'requested.sqft', label: 'Requested square feet', group: 'Requested', kind: 'text' },
  { key: 'requested.size', label: 'Requested size (W×L)', group: 'Requested', kind: 'text' },
  { key: 'requested.year', label: 'Requested year', group: 'Requested', kind: 'text' },
  { key: 'requested.budget', label: 'Requested budget', group: 'Requested', kind: 'text' },
  { key: 'requested.must_have_features', label: 'Requested must-have features', group: 'Requested', kind: 'text' },
  { key: 'requested.timeline', label: 'Requested timeline', group: 'Requested', kind: 'text' },
  { key: 'requested.notes', label: 'Requested notes', group: 'Requested', kind: 'text' },
  { key: 'org.name', label: 'Dealer name', group: 'Dealer', kind: 'text' },
  { key: 'today', label: "Today's date", group: 'Computed', kind: 'date' },
];

const BINDING_BY_KEY = new Map(BINDINGS.map((b) => [b.key, b]));

export function isBindingKey(s: string): s is BindingKey {
  return BINDING_BY_KEY.has(s as BindingKey);
}

/** Loaded data for one document generation. The generate action fills this in. */
export type BindingContext = {
  lead?: Pick<Lead, 'contact_name' | 'email' | 'phone'> | null;
  buyer?: Pick<Buyer, 'full_name' | 'email' | 'phone'> | null;
  home?:
    | (Pick<
        Home,
        'name' | 'stock_no' | 'model' | 'year_built' | 'beds' | 'baths' | 'width_ft' | 'length_ft' | 'sqft' | 'listed_price_cents'
      > & { manufacturer_name?: string | null })
    | null;
  quote?: { total_cents: number } | null;
  tradeIn?: Pick<TradeIn, 'year' | 'make' | 'model' | 'offer_cents'> | null;
  org?: Pick<Org, 'name'> | null;
  /** Buyer requirements from the lead CRM. manufacturer_names is resolved from
   *  manufacturer_ids by the generate action (this module stays DB-free). */
  preferences?:
    | (Pick<
        LeadPreferences,
        | 'preferred_types' | 'condition' | 'preferred_models' | 'preferred_colors'
        | 'min_beds' | 'max_beds' | 'min_baths' | 'max_baths' | 'min_sqft' | 'max_sqft'
        | 'min_width_ft' | 'max_width_ft' | 'min_length_ft' | 'max_length_ft'
        | 'min_year' | 'max_year' | 'min_price_cents' | 'max_price_cents'
        | 'must_have_features' | 'timeline'
      > & { manufacturer_names?: string[] | null; notes?: string | null })
    | null;
  /** ISO timestamp for `today` — passed in so resolution is deterministic/testable. */
  nowIso: string;
};

export type ResolvedBinding = {
  /** String value sent to the provider for prefill (already display-formatted). */
  value: string | null;
  /** Money snapshot in cents (the price snapshot), else null. */
  valueCents: number | null;
  /** Human display string as it should appear on the document. */
  display: string | null;
};

/** Format cents → "$1,234.56" (2 decimals, for legal documents). */
export function fmtUSD(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

/** Format an ISO date → "MM/DD/YYYY". */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function text(v: string | number | null | undefined): ResolvedBinding {
  const s = v == null || v === '' ? null : String(v);
  return { value: s, valueCents: null, display: s };
}

function money(cents: number | null | undefined): ResolvedBinding {
  if (cents == null) return { value: null, valueCents: null, display: null };
  const display = fmtUSD(cents);
  return { value: display, valueCents: cents, display };
}

/** Format a numeric range → "3–4", "3+", "up to 4", or "". */
function fmtRange(min: number | null | undefined, max: number | null | undefined): string {
  const lo = min ?? null;
  const hi = max ?? null;
  if (lo == null && hi == null) return '';
  if (lo != null && hi != null) return lo === hi ? String(lo) : `${lo}–${hi}`;
  if (lo != null) return `${lo}+`;
  return `up to ${hi}`;
}

/** Format a money range using fmtUSD on each bound. */
function fmtMoneyRange(min: number | null | undefined, max: number | null | undefined): string {
  const lo = min ?? null;
  const hi = max ?? null;
  if (lo == null && hi == null) return '';
  if (lo != null && hi != null) return `${fmtUSD(lo)}–${fmtUSD(hi)}`;
  if (lo != null) return `${fmtUSD(lo)}+`;
  return `up to ${fmtUSD(hi)}`;
}

const HOME_TYPE_LABEL: Record<string, string> = {
  single: 'Single-wide', double: 'Double-wide', modular: 'Modular',
};
const CONDITION_LABEL: Record<string, string> = {
  new: 'New', used: 'Used', either: 'New or used',
};
const REQUEST_TIMELINE_LABEL: Record<string, string> = {
  asap: 'ASAP', '1_3_months': '1–3 months', '3_6_months': '3–6 months',
  '6_12_months': '6–12 months', exploring: 'Just exploring',
};

/** Resolve one binding against a loaded context. Pure + deterministic. */
export function resolveBinding(key: BindingKey, ctx: BindingContext): ResolvedBinding {
  switch (key) {
    case 'lead.contact_name':
      return text(ctx.lead?.contact_name);
    case 'lead.email':
      return text(ctx.lead?.email);
    case 'lead.phone':
      return text(ctx.lead?.phone);
    case 'buyer.full_name':
      return text(ctx.buyer?.full_name);
    case 'buyer.email':
      return text(ctx.buyer?.email);
    case 'buyer.phone':
      return text(ctx.buyer?.phone);
    case 'home.name':
      return text(ctx.home?.name);
    case 'home.stock_no':
      return text(ctx.home?.stock_no);
    case 'home.model':
      return text(ctx.home?.model);
    case 'home.manufacturer':
      return text(ctx.home?.manufacturer_name);
    case 'home.year':
      return text(ctx.home?.year_built);
    case 'home.beds':
      return text(ctx.home?.beds);
    case 'home.baths':
      return text(ctx.home?.baths);
    case 'home.size': {
      const w = ctx.home?.width_ft;
      const l = ctx.home?.length_ft;
      return text(w && l ? `${w}×${l}` : null);
    }
    case 'home.sqft':
      return text(ctx.home?.sqft);
    case 'home.listed_price_cents':
      return money(ctx.home?.listed_price_cents);
    case 'quote.total_cents':
      return money(ctx.quote?.total_cents ?? null);
    case 'trade_in.year':
      return text(ctx.tradeIn?.year);
    case 'trade_in.make':
      return text(ctx.tradeIn?.make);
    case 'trade_in.model':
      return text(ctx.tradeIn?.model);
    case 'trade_in.offer_cents':
      return money(ctx.tradeIn?.offer_cents ?? null);
    case 'requested.types':
      return text((ctx.preferences?.preferred_types ?? []).map((t) => HOME_TYPE_LABEL[t] ?? t).join(', ') || null);
    case 'requested.condition':
      return text(ctx.preferences?.condition ? (CONDITION_LABEL[ctx.preferences.condition] ?? ctx.preferences.condition) : null);
    case 'requested.manufacturers':
      return text((ctx.preferences?.manufacturer_names ?? []).join(', ') || null);
    case 'requested.colors':
      return text((ctx.preferences?.preferred_colors ?? []).join(', ') || null);
    case 'requested.beds':
      return text(fmtRange(ctx.preferences?.min_beds, ctx.preferences?.max_beds) || null);
    case 'requested.baths':
      return text(fmtRange(ctx.preferences?.min_baths, ctx.preferences?.max_baths) || null);
    case 'requested.sqft':
      return text(fmtRange(ctx.preferences?.min_sqft, ctx.preferences?.max_sqft) || null);
    case 'requested.size': {
      const w = fmtRange(ctx.preferences?.min_width_ft, ctx.preferences?.max_width_ft);
      const l = fmtRange(ctx.preferences?.min_length_ft, ctx.preferences?.max_length_ft);
      const s = w && l ? `${w} × ${l}` : w || l;
      return text(s || null);
    }
    case 'requested.year':
      return text(fmtRange(ctx.preferences?.min_year, ctx.preferences?.max_year) || null);
    case 'requested.budget':
      return text(fmtMoneyRange(ctx.preferences?.min_price_cents, ctx.preferences?.max_price_cents) || null);
    case 'requested.must_have_features':
      return text((ctx.preferences?.must_have_features ?? []).join(', ') || null);
    case 'requested.timeline':
      return text(ctx.preferences?.timeline ? (REQUEST_TIMELINE_LABEL[ctx.preferences.timeline] ?? ctx.preferences.timeline) : null);
    case 'requested.notes':
      return text(ctx.preferences?.notes ?? null);
    case 'org.name':
      return text(ctx.org?.name);
    case 'today': {
      const display = fmtDate(ctx.nowIso);
      return { value: display, valueCents: null, display };
    }
    default: {
      // Exhaustiveness guard — a new BindingKey must be handled above.
      const _never: never = key;
      return { value: null, valueCents: null, display: null };
    }
  }
}
