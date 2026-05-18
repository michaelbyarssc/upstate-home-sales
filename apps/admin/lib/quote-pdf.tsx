/**
 * Server-side PDF generator for customer quotes.
 *
 * Uses @react-pdf/renderer in a Node runtime (server action) — never imported
 * by client components. Returns a Buffer suitable for direct upload to the
 * `quote-pdfs` Supabase Storage bucket.
 */

import { Document, Page, Text, View, pdf } from '@react-pdf/renderer';
import type { LineItem } from '@uhs/db';
import {
  base,
  C,
  PdfHeaderV2,
  PdfFooterV2,
  HomeDetailsSection,
  PhotoGrid,
  LandFinancingBox,
  FlatRatePricingSection,
  ItemizedPricingSection,
  fmtCents,
  type PreparedBy,
  type PhotoItem,
} from './pdf-components';

export type QuotePdfData = {
  orgName: string;
  brandColor?: string | null;
  homeName: string;
  modelNumber: string | null;
  manufacturer: string | null;
  stockNo: string;
  beds: number | null;
  baths: number | null;
  bedsOptions?: number[] | null;
  bathsOptions?: number[] | null;
  sqft: number | null;
  homeType: string | null;
  headline: string | null;
  description: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  lineItems: LineItem[];
  totalCents: number;
  notes: string[];
  expiresAt: string;
  createdAt: string;
  publicUrl: string;
  // V2 fields
  photos: PhotoItem[];
  preparedBy: PreparedBy;
  pricingMode: 'flat' | 'itemized';
};

function QuoteDocument({ q }: { q: QuotePdfData }) {
  const created = new Date(q.createdAt);
  const dateStr = created.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const homeModelLabel = [q.homeName, q.modelNumber ? `Model ${q.modelNumber}` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <Document>
      <Page size="LETTER" style={[base.page, { paddingTop: 14, paddingBottom: 90 }]}>
        <PdfHeaderV2 date={dateStr} preparedBy={q.preparedBy} />

        <View style={{ padding: '24px 48px 0' }}>
          {/* Home Details & Photos */}
          <HomeDetailsSection
            customerName={q.customerName}
            customerPhone={q.customerPhone}
            customerEmail={q.customerEmail}
            homeName={q.homeName}
            modelNumber={q.modelNumber}
            manufacturer={q.manufacturer}
            beds={q.beds}
            baths={q.baths}
            bedsOptions={q.bedsOptions}
            bathsOptions={q.bathsOptions}
            homeType={q.homeType}
          />

          <PhotoGrid photos={q.photos} />

          <LandFinancingBox />

          {/* Pricing */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 24, marginBottom: 20 }}>
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.brick, letterSpacing: 0.6, textTransform: 'uppercase', marginRight: 12 }}>
              QUOTE FOR
            </Text>
            <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.ink, marginRight: 8 }}>
              {q.customerName ?? 'Customer'}
            </Text>
            <Text style={{ fontSize: 12, color: C.mute }}>
              — {homeModelLabel}
            </Text>
          </View>

          {q.pricingMode === 'flat' ? (
            <FlatRatePricingSection
              items={q.lineItems}
              totalCents={q.totalCents}
              homeName={q.homeName}
              modelNumber={q.modelNumber}
            />
          ) : (
            <ItemizedPricingSection
              items={q.lineItems}
              totalCents={q.totalCents}
            />
          )}
        </View>

        <PdfFooterV2 preparedBy={q.preparedBy} />
      </Page>
    </Document>
  );
}

/**
 * Render a quote PDF to a Node Buffer. Server-only.
 */
export async function renderQuotePdf(q: QuotePdfData): Promise<Buffer> {
  const blob = await pdf(<QuoteDocument q={q} />).toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
