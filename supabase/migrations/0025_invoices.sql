-- ─── Add notes column to quotes ─────────────────────────────────────────────
alter table public.quotes add column if not exists notes_jsonb jsonb;

-- Recreate the public_quotes view to include notes_jsonb
drop view if exists public.public_quotes;
create view public.public_quotes as
select
  q.public_token,
  q.lead_id,
  q.home_id,
  q.listed_price_cents,
  q.addons_jsonb,
  q.financing_jsonb,
  q.notes_jsonb,
  q.pdf_storage_path,
  q.expires_at,
  q.created_at,
  h.name        as home_name,
  h.stock_no,
  h.beds, h.baths, h.sqft,
  h.headline, h.description,
  o.name        as org_name,
  o.brand_color
from public.quotes q
join public.homes h on h.id = q.home_id
join public.orgs o on o.id = q.org_id
where q.expires_at > now();

grant select on public.public_quotes to anon, authenticated;

-- ─── Invoices ──────────────────────────────────────────────────────────────
create table public.invoices (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs(id) on delete cascade,
  lead_id               uuid not null references public.leads(id) on delete cascade,
  home_id               uuid not null references public.homes(id) on delete restrict,
  quote_id              uuid references public.quotes(id) on delete set null,
  invoice_number        int not null,
  listed_price_cents    bigint not null,
  line_items_jsonb      jsonb not null default '[]'::jsonb,
  notes_jsonb           jsonb,
  payment_terms         text not null default 'Due on receipt',
  payment_instructions  text,
  pdf_storage_path      text,
  public_token          text not null unique default replace(gen_random_uuid()::text, '-', ''),
  due_at                timestamptz,
  created_by            uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index invoices_org_number_uidx on public.invoices (org_id, invoice_number);
create index invoices_lead_idx on public.invoices (lead_id);
create index invoices_org_idx on public.invoices (org_id, created_at desc);

-- Auto-update updated_at
create trigger invoices_updated_at
  before update on public.invoices
  for each row execute function public.tg_set_updated_at();

-- ─── Invoice payments ──────────────────────────────────────────────────────
create table public.invoice_payments (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.invoices(id) on delete cascade,
  org_id            uuid not null references public.orgs(id) on delete cascade,
  amount_cents      bigint not null,
  method            text not null check (method in ('check','wire','cash','financing','other')),
  reference         text,
  note              text,
  recorded_by       uuid references auth.users(id),
  paid_at           timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index invoice_payments_invoice_idx on public.invoice_payments (invoice_id);

-- ─── Helper: next invoice number per org ───────────────────────────────────
create or replace function public.next_invoice_number(p_org_id uuid)
returns int language sql stable as $$
  select coalesce(max(invoice_number), 0) + 1
  from public.invoices where org_id = p_org_id;
$$;

-- ─── RLS · invoices ───────────────────────────────────────────────────────
alter table public.invoices enable row level security;

create policy invoices_select_member on public.invoices
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy invoices_modify_member on public.invoices
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- ─── RLS · invoice_payments ───────────────────────────────────────────────
alter table public.invoice_payments enable row level security;

create policy invoice_payments_select_member on public.invoice_payments
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy invoice_payments_modify_member on public.invoice_payments
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- ─── Public invoice view (anon-readable by token) ─────────────────────────
create view public.public_invoices as
select
  i.public_token,
  i.invoice_number,
  i.listed_price_cents,
  i.line_items_jsonb,
  i.notes_jsonb,
  i.payment_terms,
  i.payment_instructions,
  i.due_at,
  i.created_at,
  h.name        as home_name,
  h.stock_no,
  h.beds, h.baths, h.sqft,
  o.name        as org_name,
  o.brand_color,
  coalesce(
    (select sum(p.amount_cents) from public.invoice_payments p where p.invoice_id = i.id),
    0
  ) as paid_cents
from public.invoices i
join public.homes h on h.id = i.home_id
join public.orgs o on o.id = i.org_id;

grant select on public.public_invoices to anon, authenticated;
