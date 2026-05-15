import { NextResponse } from 'next/server';
import { createClient } from '@uhs/db/server';
import type { LineItem } from '@uhs/db';
import { renderQuotePdf, type QuotePdfData } from '../../../../lib/quote-pdf';
import type { PhotoItem, PreparedBy } from '../../../../lib/pdf-components';

/**
 * POST /api/pdf/preview-quote
 *
 * Renders a quote PDF preview from the provided line items/notes
 * without saving anything to the database. Returns raw PDF bytes.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { orgId, homeId, leadId, validDays, lineItems, notes, pricingMode, selectedPhotoIds } = body as {
    orgId: string;
    homeId: string;
    leadId: string;
    validDays: number;
    lineItems: LineItem[];
    notes: string[];
    pricingMode?: 'flat' | 'itemized';
    selectedPhotoIds?: string[];
  };

  const supabase = createClient();

  const [{ data: home, error: hErr }, { data: lead }, { data: org }, { data: { user } }] = await Promise.all([
    supabase
      .from('homes')
      .select('id, name, stock_no, beds, baths, sqft, headline, description, listed_price_cents, model, type, manufacturers(name)')
      .eq('id', homeId)
      .maybeSingle(),
    supabase
      .from('leads')
      .select('contact_name, email, phone')
      .eq('id', leadId)
      .maybeSingle(),
    supabase
      .from('orgs')
      .select('name, brand_color')
      .eq('id', orgId)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (hErr || !home) {
    return NextResponse.json({ error: hErr?.message ?? 'Home not found' }, { status: 404 });
  }

  // Build photo URLs
  let photos: PhotoItem[] = [];
  if (selectedPhotoIds && selectedPhotoIds.length > 0) {
    const { data: photoRows } = await supabase
      .from('home_photos')
      .select('id, storage_path, alt_text, sort_order')
      .in('id', selectedPhotoIds)
      .order('sort_order');
    if (photoRows) {
      const baseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/home-photos`;
      photos = photoRows.map((p) => ({
        url: `${baseUrl}/${p.storage_path}`,
        caption: p.alt_text,
      }));
    }
  }

  // Build prepared-by from current user
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const preparedBy: PreparedBy = {
    name: (typeof meta.full_name === 'string' && meta.full_name) || user?.email || null,
    phone: (typeof meta.phone === 'string' && meta.phone) || null,
    email: user?.email || null,
  };

  const totalCents = lineItems.reduce((s: number, i: LineItem) => s + (i.amount_cents ?? 0), 0);
  const now = new Date();
  const expires = new Date(now.getTime() + validDays * 86_400_000);

  const pdfData: QuotePdfData = {
    orgName: org?.name ?? 'Upstate Home Sales',
    brandColor: org?.brand_color ?? null,
    homeName: home.name,
    modelNumber: (home as any).model ?? null,
    manufacturer: (home as any).manufacturers?.name ?? null,
    stockNo: home.stock_no,
    beds: home.beds ?? null,
    baths: home.baths ?? null,
    sqft: home.sqft ?? null,
    homeType: (home as any).type ?? null,
    headline: home.headline ?? null,
    description: home.description ?? null,
    customerName: lead?.contact_name ?? null,
    customerPhone: lead?.phone ?? null,
    customerEmail: lead?.email ?? null,
    lineItems,
    totalCents,
    notes,
    expiresAt: expires.toISOString(),
    createdAt: now.toISOString(),
    publicUrl: '(preview)',
    photos,
    preparedBy,
    pricingMode: pricingMode ?? 'flat',
  };

  const buf = await renderQuotePdf(pdfData);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="quote-preview.pdf"',
    },
  });
}
