import { NextResponse } from 'next/server';
import { createClient } from '@uhs/db/server';
import type { LineItem } from '@uhs/db';
import { renderQuotePdf, type QuotePdfData } from '../../../../../lib/quote-pdf';
import { renderInvoicePdf, type InvoicePdfData } from '../../../../../lib/invoice-pdf';

/**
 * GET /api/pdf/quote/{id} or /api/pdf/invoice/{id}
 *
 * Renders a PDF on-demand from snapshotted data. Requires authentication
 * and org membership (RLS handles the access check via the query).
 */
export async function GET(
  _req: Request,
  { params }: { params: { type: string; id: string } },
) {
  const { type, id } = params;
  if (type !== 'quote' && type !== 'invoice') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const supabase = createClient();

  if (type === 'quote') {
    const { data: quote, error } = await supabase
      .from('quotes')
      .select('*, homes(name, stock_no, beds, baths, beds_options, baths_options, sqft, headline, description, model, type, manufacturers(name)), leads(contact_name, email, phone), orgs(name, brand_color)')
      .eq('id', id)
      .maybeSingle();
    if (error || !quote) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const home = Array.isArray(quote.homes) ? quote.homes[0] : quote.homes;
    const lead = Array.isArray(quote.leads) ? quote.leads[0] : quote.leads;
    const org = Array.isArray(quote.orgs) ? quote.orgs[0] : quote.orgs;
    const lineItems = (quote.addons_jsonb as LineItem[] | null) ?? [];
    const notes = (quote.notes_jsonb as string[] | null) ?? [];

    const publicBase = process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomecenter.com';

    // Fetch current user for prepared-by info
    const { data: { user } } = await supabase.auth.getUser();
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;

    const pdfData: QuotePdfData = {
      orgName: org?.name ?? 'Upstate Home Center',
      brandColor: org?.brand_color ?? null,
      homeName: home?.name ?? '',
      modelNumber: (home as any)?.model ?? null,
      manufacturer: (home as any)?.manufacturers?.name ?? null,
      stockNo: home?.stock_no ?? '',
      beds: home?.beds ?? null,
      baths: home?.baths ?? null,
      bedsOptions: (home as any)?.beds_options ?? null,
      bathsOptions: (home as any)?.baths_options ?? null,
      sqft: home?.sqft ?? null,
      homeType: (home as any)?.type ?? null,
      headline: home?.headline ?? null,
      description: home?.description ?? null,
      customerName: lead?.contact_name ?? null,
      customerPhone: lead?.phone ?? null,
      customerEmail: lead?.email ?? null,
      lineItems,
      totalCents: quote.listed_price_cents,
      notes,
      expiresAt: quote.expires_at,
      createdAt: quote.created_at,
      publicUrl: `${publicBase}/q/${quote.public_token}`,
      photos: [],
      preparedBy: {
        name: (typeof meta.full_name === 'string' && meta.full_name) || user?.email || null,
        phone: (typeof meta.phone === 'string' && meta.phone) || null,
        email: user?.email || null,
      },
      pricingMode: 'flat',
    };

    const buf = await renderQuotePdf(pdfData);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="quote-${home?.stock_no ?? id}.pdf"`,
      },
    });
  }

  // Invoice
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('*, homes(name, stock_no), leads(contact_name, email, phone), orgs(name, brand_color)')
    .eq('id', id)
    .maybeSingle();
  if (invErr || !invoice) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: payments } = await supabase
    .from('invoice_payments')
    .select('amount_cents, method, paid_at, reference')
    .eq('invoice_id', id)
    .order('paid_at');

  const home = Array.isArray(invoice.homes) ? invoice.homes[0] : invoice.homes;
  const lead = Array.isArray(invoice.leads) ? invoice.leads[0] : invoice.leads;
  const org = Array.isArray(invoice.orgs) ? invoice.orgs[0] : invoice.orgs;
  const lineItems = (invoice.line_items_jsonb as LineItem[]) ?? [];
  const notes = (invoice.notes_jsonb as string[] | null) ?? [];
  const paidCents = (payments ?? []).reduce((s: number, p: any) => s + p.amount_cents, 0);

  const publicBase = process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomecenter.com';
  const pdfData: InvoicePdfData = {
    orgName: org?.name ?? 'Upstate Home Center',
    brandColor: org?.brand_color ?? null,
    invoiceNumber: invoice.invoice_number,
    homeName: home?.name ?? '',
    stockNo: home?.stock_no ?? '',
    customerName: lead?.contact_name ?? null,
    customerPhone: lead?.phone ?? null,
    customerEmail: lead?.email ?? null,
    lineItems,
    totalCents: invoice.listed_price_cents,
    paidCents,
    balanceCents: invoice.listed_price_cents - paidCents,
    payments: (payments ?? []) as any[],
    notes,
    paymentTerms: invoice.payment_terms,
    paymentInstructions: invoice.payment_instructions,
    dueAt: invoice.due_at,
    createdAt: invoice.created_at,
    publicUrl: `${publicBase}/inv/${invoice.public_token}`,
  };

  const buf = await renderInvoicePdf(pdfData);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${invoice.invoice_number}.pdf"`,
    },
  });
}
