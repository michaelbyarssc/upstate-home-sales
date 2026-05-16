// Hand-rolled, narrowly-typed surface for the schema we need at the app layer.
// Replaced by `pnpm --filter @uhs/db gen:types` once the schema settles —
// that command writes types.generated.ts. Until then, this is the contract.

export type Role = 'owner' | 'manager' | 'sales' | 'service' | 'readonly';

export interface Org {
  id: string;
  slug: string;
  name: string;
  brand_color: string | null;
  logo_url: string | null;
  default_markup_pct: number;
  sms_consent_text: string;
  /** When true, public-facing pages render "Contact for pricing" instead of dollar amounts. */
  prices_hidden: boolean;
  /** Phase H — toggle for the public AI chatbot widget. */
  ai_chat_enabled: boolean;
  /** Phase H — daily token cap for cost control (0 = unlimited; default 100k). */
  ai_daily_token_cap: number;
  /** Phase H — markdown text appended to the chatbot's system prompt. */
  faq_markdown: string | null;
  /** Phase C — design studio price display mode. */
  design_price_display: DesignPriceDisplay;
  status: 'active' | 'suspended' | 'archived';
  created_at: string;
  updated_at: string;
}

// ─── AI (Phase H) ─────────────────────────────────────────────────────────

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatSession {
  id: string;
  org_id: string;
  visitor_session_id: string | null;
  lead_id: string | null;
  buyer_id: string | null;
  started_at: string;
  ended_at: string | null;
  message_count: number;
  lead_captured: boolean;
  tokens_used: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  org_id: string;
  role: ChatRole;
  content: string | null;
  tool_calls: Array<{ name: string; args: Record<string, unknown>; result?: unknown }> | null;
  tokens_used: number;
  created_at: string;
}

export interface NlSearchQuery {
  id: string;
  org_id: string;
  query_text: string;
  parsed_filters: Record<string, unknown> | null;
  result_count: number;
  clicked_home_id: string | null;
  occurred_at: string;
}

export interface OrgMember {
  user_id: string;
  org_id: string;
  role: Role;
  scoped_lots: string[] | null;
  status: 'active' | 'suspended' | 'pending';
  /** Round-robin opt-in flag. Members with `false` are skipped by `pick_next_assignee`. */
  in_rotation: boolean;
  invited_by: string | null;
  invited_at: string | null;
  last_active_at: string | null;
  created_at: string;
}

// ─── Lead collaboration / deal sharing ────────────────────────────────────
export type CollabRole = 'viewer' | 'editor' | 'split';

export interface LeadCollaborator {
  id: string;
  lead_id: string;
  user_id: string;
  role: CollabRole;
  split_pct: number | null;
  added_by: string | null;
  note: string | null;
  created_at: string;
}

// ─── Customer portal (buyer side) ─────────────────────────────────────────
export type BuyerDocKind = 'driver_license' | 'w2' | 'proof_of_income' | 'bank_statement' | 'other';
export type MilestoneStatus = 'pending' | 'in_progress' | 'complete';
export type BuyerSuggestedHomeState = 'unread' | 'saved' | 'dismissed';

export interface Buyer {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  notify_email: boolean;
  notify_sms: boolean;
  created_at: string;
  updated_at: string;
}

export interface BuyerLeadLink {
  id: string;
  buyer_id: string;
  lead_id: string;
  org_id: string;
  status: 'invited' | 'active';
  invited_by: string | null;
  created_at: string;
}

export interface BuyerDocument {
  id: string;
  buyer_id: string;
  lead_id: string | null;
  org_id: string | null;
  kind: BuyerDocKind;
  storage_path: string;
  original_name: string;
  size_bytes: number;
  content_type: string;
  uploaded_at: string;
}

export interface BuyerSuggestedHome {
  id: string;
  buyer_id: string;
  home_id: string;
  org_id: string;
  note: string | null;
  suggested_by: string | null;
  suggested_at: string;
  buyer_state: BuyerSuggestedHomeState;
}

export interface LeadMilestone {
  id: string;
  lead_id: string;
  org_id: string;
  title: string;
  body: string | null;
  status: MilestoneStatus;
  sort_order: number;
  due_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const BUYER_DOCUMENTS_BUCKET = 'buyer-documents';
export const MODEL_3D_ASSETS_BUCKET = 'model-3d-assets';

// ─── 3D Design Studio (Phase C) ───────────────────────────────────────────

export type DesignPriceDisplay = 'monthly' | 'total' | 'hidden';
export type OptionCategory = 'exterior' | 'kitchen' | 'bath' | 'flooring' | 'misc';

export interface Model3dAsset {
  id: string;
  org_id: string;
  home_model_id: string;
  version: number;
  glb_storage_path: string;
  metadata: Record<string, unknown>;
  /** Map slot_name → mesh name(s) inside the GLB. */
  material_manifest: Record<string, string | string[]>;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface ModelOption {
  id: string;
  org_id: string;
  home_model_id: string;
  slot_name: string;
  label: string;
  category: OptionCategory | string;
  sort_order: number;
  required: boolean;
  created_at: string;
}

export type OptionOverlay =
  | { type: 'color'; color: string }
  | { type: 'texture'; texture_url: string }
  | { type: 'mesh'; mesh_name: string }
  | { type?: undefined };

export interface ModelOptionValue {
  id: string;
  org_id: string;
  option_id: string;
  value_name: string;
  label: string;
  overlay: OptionOverlay;
  price_delta_cents: number;
  is_default: boolean;
  sort_order: number;
  created_at: string;
}

export interface ModelOptionCompat {
  id: string;
  org_id: string;
  home_model_id: string;
  rule_type: 'requires' | 'conflicts';
  rule: {
    trigger: { option_id: string; value_id: string };
    target: { option_id: string; value_id: string };
  };
  notes: string | null;
  created_at: string;
}

export interface HomeDesign {
  id: string;
  org_id: string;
  home_id: string;
  buyer_id: string | null;
  lead_id: string | null;
  base_price_cents: number;
  total_price_cents: number;
  share_token: string;
  thumbnail_storage_path: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HomeDesignSelection {
  id: string;
  design_id: string;
  org_id: string;
  option_id: string;
  value_id: string;
  snapshot_price_delta_cents: number;
  selected_at: string;
}

export interface PublicHomeDesign {
  share_token: string;
  home_id: string;
  base_price_cents: number;
  total_price_cents: number;
  thumbnail_storage_path: string | null;
  created_at: string;
  home_name: string;
  home_stock_no: string;
  home_beds: number | null;
  home_baths: number | null;
  home_sqft: number | null;
  org_name: string;
  org_brand_color: string | null;
  design_price_display: DesignPriceDisplay;
}

export interface PublicHomeDesignSelection {
  share_token: string;
  option_id: string;
  value_id: string;
  snapshot_price_delta_cents: number;
  slot_name: string;
  option_label: string;
  value_name: string;
  value_label: string;
  overlay: OptionOverlay;
}

export interface HomeCollection {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  description: string | null;
  hero_storage_path: string | null;
  sort_order: number;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HomeCollectionMember {
  collection_id: string;
  home_id: string;
  org_id: string;
  sort_order: number;
  added_at: string;
}

export type ZoneKind = 'zip' | 'county';

export interface DeliveryZone {
  id: string;
  org_id: string;
  kind: ZoneKind;
  value: string;
  label: string | null;
  created_at: string;
}

export interface Lot {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  manager_id: string | null;
  /** Phase F — every lot lives under a location. Null only for very old rows
   *  pre-migration (the 0018 backfill assigns all to the org's default location). */
  location_id: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Multi-location (Phase F) ─────────────────────────────────────────────

export type DayHours = {
  open?: string;
  close?: string;
  closed?: boolean;
};

export type LocationHours = Partial<Record<
  'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun',
  DayHours
>>;

export interface Location {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  hours_jsonb: LocationHours | null;
  brand_color: string | null;
  logo_storage_path: string | null;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export type RegionKind = 'zip' | 'county' | 'state';

export interface HomeRegionPricing {
  id: string;
  home_id: string;
  org_id: string;
  region_type: RegionKind;
  region_value: string;
  override_price_cents: number;
  effective_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformAdmin {
  user_id: string;
  granted_by: string | null;
  granted_at: string;
  notes: string | null;
}

export interface OrgMembershipWithOrg extends OrgMember {
  orgs: Pick<Org, 'id' | 'slug' | 'name' | 'brand_color' | 'logo_url'>;
}

// ─── Inventory ────────────────────────────────────────────────────────────
export type HomeStatus = 'draft' | 'published' | 'hold' | 'sold' | 'archived';
export type HomeType = 'single' | 'double' | 'modular';

export interface Manufacturer {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  created_at: string;
}

export interface HomeModel {
  id: string;
  org_id: string;
  manufacturer_id: string | null;
  name: string;
  model_code: string | null;
  series: string | null;
  type: HomeType;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  width_ft: number | null;
  length_ft: number | null;
  year_built: number | null;
  construction: string | null;
  headline: string | null;
  description: string | null;
  source_url: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HomeModelPhoto {
  id: string;
  home_model_id: string;
  org_id: string;
  storage_path: string;
  sort_order: number;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

// ─── Public API + Marketplace (Phase I) ───────────────────────────────────

export interface OrgApiKey {
  id: string;
  org_id: string;
  key_hash: string;
  name: string;
  scopes: string[];
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
}

export interface MarketplaceView {
  id: string;
  home_id: string;
  viewer_session_id: string | null;
  viewer_ip_city: string | null;
  viewer_ip_region: string | null;
  viewer_ip_country: string | null;
  occurred_at: string;
}

export interface Home {
  id: string;
  org_id: string;
  lot_id: string | null;
  model_id: string | null;
  stock_no: string;
  name: string;
  manufacturer_id: string | null;
  model: string | null;
  type: HomeType;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  width_ft: number | null;
  length_ft: number | null;
  year_built: number | null;
  construction: string | null;
  base_price_cents: number;
  markup_pct: number;
  addons_cents: number;
  addons_markup_pct: number;
  addons_jsonb: HomeAddon[] | null;
  setup_cents: number;
  setup_markup_pct: number;
  include_setup_in_price: boolean;
  starting_from: boolean;
  /** Generated by Postgres — never set client-side. */
  listed_price_cents: number;
  headline: string | null;
  description: string | null;
  matterport_url: string | null;
  status: HomeStatus;
  on_lot_since: string | null;
  is_featured: boolean;
  hide_from_search: boolean;
  /** Phase I — when true, this home shows on /marketplace. */
  marketplace_opt_in: boolean;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

/** What anon (public site) sees — base_price_cents and markup_pct stripped.
 *  listed_price_cents is null when the org has prices_hidden=true. */
export interface PublicHome {
  id: string;
  org_id: string;
  lot_id: string | null;
  stock_no: string;
  name: string;
  manufacturer_id: string | null;
  model: string | null;
  type: HomeType;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  width_ft: number | null;
  length_ft: number | null;
  year_built: number | null;
  construction: string | null;
  listed_price_cents: number | null;
  prices_hidden: boolean;
  starting_from: boolean;
  headline: string | null;
  description: string | null;
  matterport_url: string | null;
  on_lot_since: string | null;
  is_featured: boolean;
  created_at: string;
}

export interface HomePhoto {
  id: string;
  home_id: string;
  org_id: string;
  storage_path: string;
  sort_order: number;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface PublicHomePhoto {
  id: string;
  home_id: string;
  storage_path: string;
  sort_order: number;
  alt_text: string | null;
  width: number | null;
  height: number | null;
}

export const HOME_PHOTO_BUCKET = 'home-photos';
export const QUOTE_PDF_BUCKET = 'quote-pdfs';
export const TRADEIN_PHOTO_BUCKET = 'tradein-photos';
export const ORG_BRANDING_BUCKET = 'org-branding';

/** Format cents → "$1,234". Used everywhere we render listed prices. */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  const dollars = Math.round(cents / 100);
  return '$' + dollars.toLocaleString();
}

// ─── Leads ────────────────────────────────────────────────────────────────
export type LeadSource =
  | 'quote_form' | 'contact_form' | 'phone' | 'walkin' | 'tradein' | 'import';
export type LeadStage = 'new' | 'in_progress' | 'quoted' | 'won' | 'lost';
export type MessageKind = 'inbound' | 'outbound' | 'note' | 'system';
export type MessageChannel = 'email' | 'sms' | 'call';

export interface Lead {
  id: string;
  org_id: string;
  home_id: string | null;
  contact_name: string;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  stage: LeadStage;
  assignee_id: string | null;
  /** Phase F — set by lead-intake's nearest-location lookup or by manual
   *  routing in the admin. Null only for very old rows pre-migration. */
  assigned_location_id: string | null;
  is_hot: boolean;
  next_action: string | null;
  reply_token: string;
  sms_consent: boolean;
  sms_consent_at: string | null;
  sms_consent_text: string | null;
  sms_consent_ip: string | null;
  sms_consent_method: 'form' | 'admin' | 'portal' | 'email_link' | null;
  sms_opt_in_token: string | null;
  qualifier_payload: Record<string, unknown> | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  fbclid: string | null;
  referrer_url: string | null;
  landing_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadStageHistory {
  id: string;
  lead_id: string;
  org_id: string;
  from_stage: LeadStage | null;
  to_stage: LeadStage;
  changed_by: string | null;
  changed_at: string;
  reason: string | null;
}

export interface LeadMessage {
  id: string;
  lead_id: string;
  org_id: string;
  kind: MessageKind;
  channel: MessageChannel | null;
  author_id: string | null;
  body: string;
  attachments: unknown;
  external_id: string | null;
  sent_at: string;
}

export interface HomeAddon {
  description: string;
  cost_cents: number;
  markup_pct: number;
}

export interface LineItem {
  description: string;
  subtitle?: string | null;
  amount_cents: number | null;
}

export interface Quote {
  id: string;
  org_id: string;
  lead_id: string;
  home_id: string;
  listed_price_cents: number;
  addons_jsonb: unknown;
  financing_jsonb: unknown;
  notes_jsonb: unknown;
  pdf_storage_path: string | null;
  public_token: string;
  expires_at: string;
  visible_to_buyer: boolean;
  created_by: string | null;
  created_at: string;
}

export type PaymentMethod = 'check' | 'wire' | 'cash' | 'financing' | 'other';

export interface Invoice {
  id: string;
  org_id: string;
  lead_id: string;
  home_id: string;
  quote_id: string | null;
  invoice_number: number;
  listed_price_cents: number;
  line_items_jsonb: LineItem[];
  notes_jsonb: string[] | null;
  payment_terms: string;
  payment_instructions: string | null;
  pdf_storage_path: string | null;
  public_token: string;
  due_at: string | null;
  visible_to_buyer: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  org_id: string;
  amount_cents: number;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  recorded_by: string | null;
  paid_at: string;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  org_id: string;
  lead_id: string;
  home_id: string;
  quote_id: string | null;
  po_number: number;
  listed_price_cents: number;
  line_items_jsonb: LineItem[];
  notes_jsonb: string[] | null;
  terms: string | null;
  delivery_date: string | null;
  pdf_storage_path: string | null;
  public_token: string;
  visible_to_buyer: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteSignature {
  id: string;
  quote_id: string;
  org_id: string;
  signer_name: string;
  signer_email: string;
  signature_path: string;
  signer_ip: string | null;
  signer_useragent: string | null;
  signed_at: string;
}

// ─── Campaigns ────────────────────────────────────────────────────────────
export type CampaignChannel = 'email' | 'sms';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'archived';
export type EnrollmentStatus = 'active' | 'completed' | 'unsubscribed' | 'errored';

export interface Campaign {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  channel: CampaignChannel;
  status: CampaignStatus;
  trigger_event: string | null;
  trigger_filter: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignStep {
  id: string;
  campaign_id: string;
  org_id: string;
  step_order: number;
  delay_seconds: number;
  subject: string | null;
  body: string;
}

export interface CampaignEnrollment {
  id: string;
  campaign_id: string;
  org_id: string;
  lead_id: string;
  status: EnrollmentStatus;
  current_step: number;
  next_send_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
  error_text: string | null;
}

// ─── Workflow rules ───────────────────────────────────────────────────────
export type WorkflowEvent =
  | 'lead.created'
  | 'lead.stage.changed'
  | 'quote.sent'
  | 'quote.signed'
  | 'invoice.sent'
  | 'lead.message.received';

export type WorkflowAction =
  | { type: 'enroll_in_campaign'; campaign_id: string }
  | { type: 'assign_lead'; user_id: string | 'round_robin' }
  | { type: 'set_stage'; stage: LeadStage }
  | { type: 'tag'; value: string }
  | { type: 'notify_email'; to: string; subject: string; body: string };

export interface WorkflowRule {
  id: string;
  org_id: string;
  name: string;
  enabled: boolean;
  event: WorkflowEvent;
  filter: Record<string, unknown> | null;
  actions: WorkflowAction[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRun {
  id: string;
  rule_id: string;
  org_id: string;
  event: WorkflowEvent;
  payload: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  result: Record<string, unknown> | null;
  error_text: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

// ─── Property mapping (Phase E) ───────────────────────────────────────────

/** GeoJSON Polygon shape returned by Regrid + stored in property_placements. */
export interface ParcelGeoJson {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

export interface OrgSetbackRules {
  org_id: string;
  /** Distance in feet from the front lot line. */
  front_ft: number;
  /** Distance in feet from each side lot line. */
  side_ft: number;
  /** Distance in feet from the rear lot line. */
  rear_ft: number;
  /** Extra setback for road easements; defaults to 0. */
  road_easement_ft: number;
  updated_at: string;
}

export interface ParcelCacheEntry {
  cache_key: string;
  parcel_id: string;
  address: string | null;
  county: string | null;
  centroid_lat: number;
  centroid_lng: number;
  geojson: ParcelGeoJson;
  raw: Record<string, unknown> | null;
  cached_at: string;
}

/** Per-county parcel record from the DIY pipeline (Phase E.2).
 *  Sourced from free public county GIS portals or Local Gradient bulk data. */
export interface Parcel {
  id: string;
  parcel_id: string;
  state: string;
  county: string;
  address: string | null;
  city: string | null;
  zip: string | null;
  /** Read via the RPC `lookup_parcel_by_point()` which projects ST_AsGeoJSON. */
  geom?: unknown;
  centroid_lat: number;
  centroid_lng: number;
  raw_props: Record<string, unknown> | null;
  source: string | null;
  imported_at: string;
}

// ─── Marketing infra (Phase G) ────────────────────────────────────────────

export type IntegrationKind = 'gmb' | 'meta' | 'ga4' | 'gtm';
export type IntegrationStatus = 'connected' | 'disconnected' | 'error';

export interface OrgIntegration {
  id: string;
  org_id: string;
  kind: IntegrationKind;
  /** Encrypted bytea — never accessed directly client-side. */
  credentials_enc?: unknown;
  /** Plain non-secret config: ga4_measurement_id, meta_pixel_id, gmb_account_id, etc. */
  config: Record<string, unknown>;
  status: IntegrationStatus;
  status_detail: string | null;
  connected_at: string;
  last_sync_at: string | null;
  created_by: string | null;
  updated_at: string;
}

export interface GmbReview {
  id: string;
  org_id: string;
  location_id: string | null;
  gmb_review_id: string;
  author_name: string | null;
  author_photo_url: string | null;
  rating: number;
  comment: string | null;
  reviewed_at: string;
  replied_at: string | null;
  replied_by: string | null;
  reply_text: string | null;
  imported_at: string;
}

export type VisitorEventKind =
  | 'page_view'
  | 'inventory_view'
  | 'home_view'
  | 'marketplace_view'
  | 'lead_submitted'
  | 'quote_viewed'
  | 'quote_signed';

export interface VisitorEvent {
  id: string;
  org_id: string;
  session_id: string;
  event_type: VisitorEventKind;
  home_id: string | null;
  lead_id: string | null;
  ip_city: string | null;
  ip_region: string | null;
  ip_country: string | null;
  referrer_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  path: string | null;
  occurred_at: string;
}

export interface ParcelImport {
  id: string;
  state: string;
  county: string;
  source: string;
  feature_count: number;
  imported_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface PropertyPlacement {
  id: string;
  org_id: string;
  home_id: string | null;
  lead_id: string | null;
  label: string | null;
  search_query: string;
  parcel_id: string | null;
  parcel_geojson: ParcelGeoJson;
  parcel_lat: number;
  parcel_lng: number;
  footprint_w_ft: number;
  footprint_l_ft: number;
  anchor_lat: number;
  anchor_lng: number;
  /** 0-359 degrees; 0 = home long-axis points north. */
  orientation_deg: number;
  address: string | null;
  county: string | null;
  share_token: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** What anon sees on the share page; strips internal columns + joins org branding. */
export interface PublicPropertyPlacement {
  share_token: string;
  label: string | null;
  address: string | null;
  county: string | null;
  parcel_geojson: ParcelGeoJson;
  parcel_lat: number;
  parcel_lng: number;
  footprint_w_ft: number;
  footprint_l_ft: number;
  anchor_lat: number;
  anchor_lng: number;
  orientation_deg: number;
  created_at: string;
  org_name: string;
  org_brand_color: string | null;
  org_logo_url: string | null;
  setback_front_ft: number;
  setback_side_ft: number;
  setback_rear_ft: number;
  setback_road_easement_ft: number;
  home_name: string | null;
  home_stock_no: string | null;
  home_beds: number | null;
  home_baths: number | null;
  home_sqft: number | null;
}

export interface TradeIn {
  id: string;
  org_id: string;
  lead_id: string | null;
  contact_name: string;
  email: string | null;
  phone: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  size_w: number | null;
  size_l: number | null;
  condition_notes: string | null;
  photos_paths: string[] | null;
  offer_cents: number | null;
  status: 'submitted' | 'reviewed' | 'offered' | 'accepted' | 'declined';
  sms_consent: boolean;
  sms_consent_at: string | null;
  sms_consent_text: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}
