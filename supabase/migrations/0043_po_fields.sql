-- ============================================================================
-- 0043_po_fields.sql
-- Collect the data the SC Form 500 / EV500SC purchase order needs but the system
-- never captured (createPurchaseOrder hardcoded these null/0). Gathered at the
-- invoice phase so they're ready when an invoice is turned into a PO via the
-- document-signing engine.
--
-- All additive (`add column if not exists`) — safe on a populated table.
-- ============================================================================

-- ─── Leads: customer delivery / mailing address + co-buyer (customer-level,
-- reusable across the deal's documents) ──────────────────────────────────────
alter table public.leads add column if not exists delivery_address text;
alter table public.leads add column if not exists delivery_city    text;
alter table public.leads add column if not exists delivery_state    text;
alter table public.leads add column if not exists delivery_zip      text;
alter table public.leads add column if not exists mailing_address   text;
alter table public.leads add column if not exists co_buyer_name     text;

-- ─── Homes: manufacturer serial number (unit-level) ──────────────────────────
alter table public.homes add column if not exists serial_no text;

-- ─── Invoices: deal-specific financial breakdown for the Form 500 ────────────
alter table public.invoices add column if not exists sales_tax_cents      bigint not null default 0;
alter table public.invoices add column if not exists fees_cents           bigint not null default 0;
alter table public.invoices add column if not exists cash_deposit_cents   bigint not null default 0;
alter table public.invoices add column if not exists cash_as_agreed_cents bigint not null default 0;

-- ─── Trade-ins: balance still owed on the trade (allowance = offer_cents) ─────
alter table public.trade_ins add column if not exists balance_owed_cents bigint not null default 0;
