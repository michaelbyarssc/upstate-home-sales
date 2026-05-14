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
  PdfHeader,
  PreparedFor,
  LineItemsTable,
  NotesSection,
  PdfFooter,
  fmtCents,
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
};

function QuoteDocument({ q }: { q: QuotePdfData }) {
  const created = new Date(q.createdAt);
  const expires = new Date(q.expiresAt);
  const dateStr = created.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const specsLine = [
    q.beds != null ? `${q.beds} Bed` : null,
    q.baths != null ? `${q.baths} Bath` : null,
  ]
    .filter(Boolean)
    .join(' / ');

  const typeLabel = q.homeType ?? 'Manufactured Home';

  return (
    <Document>
      <Page size="LETTER" style={base.page}>
        <PdfHeader orgName={q.orgName} docType="QUOTE" date={dateStr} />

        <View style={base.body}>
          {/* Home info */}
          <Text style={base.homeName}>{q.homeName}</Text>
          {(q.modelNumber || q.manufacturer) && (
            <Text style={base.homeModel}>
              {[
                q.modelNumber ? `Model ${q.modelNumber}` : null,
                q.manufacturer ? `Built by ${q.manufacturer}` : null,
              ]
                .filter(Boolean)
                .join('  ·  ')}
            </Text>
          )}
          {(specsLine || typeLabel) && (
            <Text style={base.homeSpecs}>
              {[specsLine, typeLabel].filter(Boolean).join('  |  ')}
            </Text>
          )}

          {/* Prepared For */}
          <PreparedFor
            name={q.customerName}
            phone={q.customerPhone}
            email={q.customerEmail}
          />

          {/* Line items */}
          <LineItemsTable
            label="Flat Rate Pricing"
            items={q.lineItems}
            totalCents={q.totalCents}
          />

          {/* Notes + validity — kept together so they don't split across footer */}
          <View wrap={false}>
            <NotesSection notes={q.notes} />

            {/* Validity note */}
            <Text
              style={{
                marginTop: 14,
                fontSize: 8,
                color: '#6b6863',
                fontStyle: 'italic',
                lineHeight: 1.5,
              }}
            >
              Pricing snapshotted on {dateStr}. This quote is valid for{' '}
              {Math.max(0, Math.ceil((expires.getTime() - created.getTime()) / 86_400_000))} days
              from the date above (expires {expires.toLocaleDateString()}).
              Your quoted price of {fmtCents(q.totalCents)} is locked through expiry.
            </Text>
          </View>
        </View>

        <PdfFooter />
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
