-- ─────────────────────────────────────────────────────────────────────────────
-- 0031_purchase_orders_and_buyer_doc_visibility.sql
--
-- 1. New `purchase_orders` table (mirrors `invoices`).
-- 2. RLS policies so linked buyers can SELECT quotes, invoices, and
--    purchase_orders for their lead via buyer_lead_links.
-- 3. Storage policy so linked buyers can read PDFs from the quote-pdfs bucket
--    (used by quotes, invoices, and POs — path format `{org_id}/...`).
--
-- Companion app code stamps `lead_id` + `org_id` on buyer_documents at upload
-- time so the existing buyer_documents_org_select RLS surfaces them in admin.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── purchase_orders table ────────────────────────────────────────────────
create table public.purchase_orders (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  lead_id             uuid not null references public.leads(id) on delete cascade,
  home_id             uuid not null references public.homes(id) on delete restrict,
  quote_id            uuid references public.quotes(id) on delete set null,
  po_number           int not null,
  listed_price_cents  bigint not null,
  line_items_jsonb    jsonb not null default '[]'::jsonb,
  notes_jsonb         jsonb,
  terms               text,
  delivery_date       date,
  pdf_storage_path    text,
  public_token        text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index purchase_orders_org_number_uidx on public.purchase_orders (org_id, po_number);
create index purchase_orders_lead_idx on public.purchase_orders (lead_id);
create index purchase_orders_org_idx on public.purchase_orders (org_id, created_at desc);

create trigger purchase_orders_updated_at
  before update on public.purchase_orders
  for each row execute function public.tg_set_updated_at();

create or replace function public.next_po_number(p_org_id uuid)
returns int language sql stable as $$
  select coalesce(max(po_number), 0) + 1
  from public.purchase_orders where org_id = p_org_id;
$$;

-- ─── RLS · purchase_orders (org members) ──────────────────────────────────
alter table public.purchase_orders enable row level security;

create policy purchase_orders_select_member on public.purchase_orders
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy purchase_orders_modify_member on public.purchase_orders
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- ─── Public PO view (anon by token, mirrors public_invoices) ──────────────
create view public.public_purchase_orders as
select
  po.public_token,
  po.po_number,
  po.listed_price_cents,
  po.line_items_jsonb,
  po.notes_jsonb,
  po.terms,
  po.delivery_date,
  po.created_at,
  h.name as home_name,
  h.stock_no,
  h.beds, h.baths, h.sqft,
  o.name as org_name,
  o.brand_color
from public.purchase_orders po
join public.homes h on h.id = po.home_id
join public.orgs o on o.id = po.org_id;

grant select on public.public_purchase_orders to anon, authenticated;

-- ─── Buyer RLS · quotes/invoices/purchase_orders via buyer_lead_links ─────
create policy quotes_buyer_select on public.quotes
  for select to authenticated
  using (
    exists (
      select 1 from public.buyer_lead_links bll
      where bll.buyer_id = auth.uid()
        and bll.lead_id = quotes.lead_id
        and bll.status = 'active'
    )
  );

create policy invoices_buyer_select on public.invoices
  for select to authenticated
  using (
    exists (
      select 1 from public.buyer_lead_links bll
      where bll.buyer_id = auth.uid()
        and bll.lead_id = invoices.lead_id
        and bll.status = 'active'
    )
  );

create policy purchase_orders_buyer_select on public.purchase_orders
  for select to authenticated
  using (
    exists (
      select 1 from public.buyer_lead_links bll
      where bll.buyer_id = auth.uid()
        and bll.lead_id = purchase_orders.lead_id
        and bll.status = 'active'
    )
  );

-- ─── Storage: buyer read access to quote-pdfs bucket for their org ────────
-- Path format is `{org_id}/{...}`. The bucket holds quotes, invoices, and POs.
-- Buyers can read any object whose first segment matches an org they've been
-- linked to via buyer_lead_links with status='active'.
create policy quote_pdfs_buyer_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'quote-pdfs'
    and exists (
      select 1 from public.buyer_lead_links bll
      where bll.buyer_id = auth.uid()
        and bll.org_id::text = split_part(storage.objects.name, '/', 1)
        and bll.status = 'active'
    )
  );

-- ─── Storage: admin (org member) read access to buyer-documents ───────────
-- When a buyer uploads a doc and stamps it with lead_id+org_id, the admins
-- in that org need to actually open the file. The DB row is already visible
-- via buyer_documents_org_select; this policy gives them storage read.
create policy buyer_documents_storage_org_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'buyer-documents'
    and exists (
      select 1
      from public.buyer_documents bd
      where bd.storage_path = storage.objects.name
        and bd.org_id is not null
        and bd.org_id = any(public.org_ids())
    )
  );
