import { createClient } from '@uhs/db/server';
import { DocumentsClient, type DealerDoc, type LinkedLeadOption } from './documents-client';
import type { BuyerDocument } from '@uhs/db';

export const metadata = { title: 'Documents · Buyer portal' };
export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  // Buyer's own uploads
  const { data: docs } = await sb
    .from('buyer_documents')
    .select('id, kind, original_name, size_bytes, content_type, uploaded_at, storage_path, lead_id, org_id, buyer_id')
    .eq('buyer_id', user.id)
    .order('uploaded_at', { ascending: false });

  // Linked leads (for upload picker + dealer docs lookup)
  const { data: links } = await sb
    .from('buyer_lead_links')
    .select('lead_id, org_id, leads(contact_name, home_id, homes(name, stock_no))')
    .eq('buyer_id', user.id)
    .eq('status', 'active');

  const linkedLeads: LinkedLeadOption[] = (links ?? []).map((l: any) => {
    const home = Array.isArray(l.leads?.homes) ? l.leads.homes[0] : l.leads?.homes;
    return {
      leadId: l.lead_id,
      orgId: l.org_id,
      label: home?.name ?? l.leads?.contact_name ?? 'Your inquiry',
      stockNo: home?.stock_no ?? null,
    };
  });

  const leadIds = linkedLeads.map((l) => l.leadId);
  const leadLabelById = new Map(linkedLeads.map((l) => [l.leadId, l.label] as const));

  // Dealer-issued docs: quotes, invoices, purchase_orders for those leads
  let dealerDocs: DealerDoc[] = [];
  if (leadIds.length > 0) {
    const [quotesRes, invoicesRes, posRes] = await Promise.all([
      sb
        .from('quotes')
        .select('id, lead_id, pdf_storage_path, public_token, listed_price_cents, created_at, expires_at, homes(name, stock_no)')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false }),
      sb
        .from('invoices')
        .select('id, lead_id, pdf_storage_path, public_token, invoice_number, listed_price_cents, created_at, due_at, homes(name, stock_no)')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false }),
      sb
        .from('purchase_orders')
        .select('id, lead_id, pdf_storage_path, public_token, po_number, listed_price_cents, created_at, delivery_date, homes(name, stock_no)')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false }),
    ]);

    const quoteRows = (quotesRes.data ?? []).map((q: any) => {
      const home = Array.isArray(q.homes) ? q.homes[0] : q.homes;
      return {
        kind: 'quote' as const,
        id: q.id,
        leadId: q.lead_id,
        leadLabel: leadLabelById.get(q.lead_id) ?? 'Your inquiry',
        homeName: home?.name ?? null,
        title: `Quote · ${home?.name ?? 'Home'}`,
        publicToken: q.public_token,
        publicHref: `/q/${q.public_token}`,
        pdfStoragePath: q.pdf_storage_path,
        totalCents: q.listed_price_cents,
        createdAt: q.created_at,
        secondaryDate: q.expires_at,
        secondaryLabel: 'Expires',
      };
    });

    const invoiceRows = (invoicesRes.data ?? []).map((iv: any) => {
      const home = Array.isArray(iv.homes) ? iv.homes[0] : iv.homes;
      return {
        kind: 'invoice' as const,
        id: iv.id,
        leadId: iv.lead_id,
        leadLabel: leadLabelById.get(iv.lead_id) ?? 'Your inquiry',
        homeName: home?.name ?? null,
        title: `Invoice #${iv.invoice_number} · ${home?.name ?? 'Home'}`,
        publicToken: iv.public_token,
        publicHref: `/inv/${iv.public_token}`,
        pdfStoragePath: iv.pdf_storage_path,
        totalCents: iv.listed_price_cents,
        createdAt: iv.created_at,
        secondaryDate: iv.due_at,
        secondaryLabel: 'Due',
      };
    });

    const poRows = (posRes.data ?? []).map((po: any) => {
      const home = Array.isArray(po.homes) ? po.homes[0] : po.homes;
      return {
        kind: 'po' as const,
        id: po.id,
        leadId: po.lead_id,
        leadLabel: leadLabelById.get(po.lead_id) ?? 'Your inquiry',
        homeName: home?.name ?? null,
        title: `Purchase Order #${po.po_number} · ${home?.name ?? 'Home'}`,
        publicToken: po.public_token,
        publicHref: `/po/${po.public_token}`,
        pdfStoragePath: po.pdf_storage_path,
        totalCents: po.listed_price_cents,
        createdAt: po.created_at,
        secondaryDate: po.delivery_date,
        secondaryLabel: 'Delivery',
      };
    });

    dealerDocs = [...quoteRows, ...invoiceRows, ...poRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow">Financing</div>
        <h1 style={{ marginTop: 6 }}>Documents</h1>
        <p style={{ fontSize: 'var(--t-body-l)', color: 'var(--c-ink-soft)', marginTop: 8 }}>
          Quotes, invoices, and purchase orders your dealer has shared with you, plus your own
          uploads (driver&rsquo;s license, W2s, proof of income). Files are encrypted at rest.
        </p>
      </div>

      <DocumentsClient
        initialDocs={(docs ?? []) as BuyerDocument[]}
        userId={user.id}
        linkedLeads={linkedLeads}
        dealerDocs={dealerDocs}
      />
    </>
  );
}
