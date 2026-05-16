-- ─────────────────────────────────────────────────────────────────────────────
-- 0032_doc_visibility_toggle.sql
--
-- Admin can toggle whether a quote/invoice/purchase_order is shown to the
-- linked buyer in /portal/documents. Default true (newly created docs are
-- visible). RLS for buyer SELECT now also requires `visible_to_buyer = true`.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.quotes          add column visible_to_buyer boolean not null default true;
alter table public.invoices        add column visible_to_buyer boolean not null default true;
alter table public.purchase_orders add column visible_to_buyer boolean not null default true;

-- Recreate buyer SELECT policies with visibility check.
drop policy if exists quotes_buyer_select on public.quotes;
create policy quotes_buyer_select on public.quotes
  for select to authenticated
  using (
    visible_to_buyer = true
    and exists (
      select 1 from public.buyer_lead_links bll
      where bll.buyer_id = auth.uid()
        and bll.lead_id = quotes.lead_id
        and bll.status = 'active'
    )
  );

drop policy if exists invoices_buyer_select on public.invoices;
create policy invoices_buyer_select on public.invoices
  for select to authenticated
  using (
    visible_to_buyer = true
    and exists (
      select 1 from public.buyer_lead_links bll
      where bll.buyer_id = auth.uid()
        and bll.lead_id = invoices.lead_id
        and bll.status = 'active'
    )
  );

drop policy if exists purchase_orders_buyer_select on public.purchase_orders;
create policy purchase_orders_buyer_select on public.purchase_orders
  for select to authenticated
  using (
    visible_to_buyer = true
    and exists (
      select 1 from public.buyer_lead_links bll
      where bll.buyer_id = auth.uid()
        and bll.lead_id = purchase_orders.lead_id
        and bll.status = 'active'
    )
  );
