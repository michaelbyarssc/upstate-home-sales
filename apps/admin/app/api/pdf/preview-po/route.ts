import { NextResponse } from 'next/server';
import { createClient } from '@uhs/db/server';
import type { LineItem } from '@uhs/db';
import { renderPoPdf, type PoPdfData } from '../../../../lib/po-pdf';

/**
 * POST /api/pdf/preview-po
 *
 * Renders a Purchase Order (SC Form 500) preview from the provided line items
 * without saving to the database. Returns raw PDF bytes.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const {
    orgId,
    homeId,
    leadId,
    lineItems,
    notes,
    terms,
    deliveryDate,
  } = body as {
    orgId: string;
    homeId: string;
    leadId: string;
    lineItems: LineItem[];
    notes: string[];
    terms: string | null;
    deliveryDate: string | null;
  };

  const supabase = createClient();

  const [{ data: home, error: hErr }, { data: lead }, { data: org }] = await Promise.all([
    supabase
      .from('homes')
      .select(
        'id, name, stock_no, model, year_built, beds, baths, width_ft, length_ft, listed_price_cents, manufacturers(name)',
      )
      .eq('id', homeId)
      .maybeSingle(),
    supabase
      .from('leads')
      .select('contact_name, email, phone')
      .eq('id', leadId)
      .maybeSingle(),
    supabase.from('orgs').select('name, brand_color').eq('id', orgId).maybeSingle(),
  ]);
  if (hErr || !home) {
    return NextResponse.json({ error: hErr?.message ?? 'Home not found' }, { status: 404 });
  }

  const totalCents = lineItems.reduce((s: number, i: LineItem) => s + (i.amount_cents ?? 0), 0);
  const manufacturerRel = (home as any).manufacturers;
  const manufacturerName = Array.isArray(manufacturerRel)
    ? manufacturerRel[0]?.name
    : manufacturerRel?.name;
  const approxSize = (home as any).width_ft && (home as any).length_ft
    ? `${(home as any).width_ft}x${(home as any).length_ft}`
    : null;

  const pdfData: PoPdfData = {
    orgName: org?.name ?? 'Upstate Home Center',
    orgAddressLines: [
      org?.name ?? 'Upstate Home Center',
      '280 Gossett Rd',
      'Spartanburg, SC 29307',
      '(864) 680-4030',
    ],
    orgPhone: '(864) 680-4030',
    dealerLicense: 'MDL.35948',
    poNumber: 0, // preview only — no DB row yet
    housingConsultant: null,
    homeName: home.name,
    stockNo: home.stock_no,
    manufacturer: manufacturerName ?? null,
    modelNumber: (home as any).model ?? null,
    approxSize,
    year: (home as any).year_built ?? null,
    beds: (home as any).beds ?? null,
    baths: (home as any).baths ?? null,
    serialNo: null,
    customerName: lead?.contact_name ?? null,
    coBuyerName: null,
    customerPhone: lead?.phone ?? null,
    customerEmail: lead?.email ?? null,
    deliveryAddress: null,
    deliveryCity: null,
    deliveryState: null,
    deliveryZip: null,
    mailingAddress: null,
    lineItems,
    totalCents,
    homePriceCents: (home as any).listed_price_cents ?? 0,
    salesTaxCents: 0,
    feesCents: 0,
    tradeInAllowanceCents: 0,
    tradeInBalanceOwedCents: 0,
    cashDepositCents: 0,
    cashAsAgreedCents: 0,
    notes,
    terms,
    deliveryDate,
    createdAt: new Date().toISOString(),
  };

  const buf = await renderPoPdf(pdfData);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="po-preview.pdf"',
    },
  });
}
