/**
 * Server-side PDF generator for purchase orders.
 * Mirrors the invoice PDF but with PO-specific framing.
 */

import { Document, Page, Text, View, pdf } from '@react-pdf/renderer';
import type { LineItem } from '@uhs/db';
import {
  base,
  C,
  PdfHeader,
  PreparedFor,
  LineItemsTable,
  NotesSection,
  PdfFooter,
} from './pdf-components';

export type PoPdfData = {
  orgName: string;
  brandColor?: string | null;
  poNumber: number;
  homeName: string;
  stockNo: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  lineItems: LineItem[];
  totalCents: number;
  notes: string[];
  terms: string | null;
  deliveryDate: string | null;
  createdAt: string;
};

function PoDocument({ d }: { d: PoPdfData }) {
  const dateStr = new Date(d.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Document>
      <Page size="LETTER" style={base.page}>
        <PdfHeader orgName={d.orgName} docType="PURCHASE ORDER" date={dateStr} />

        <View style={base.body}>
          <Text style={base.homeName}>PO #{d.poNumber}</Text>
          <Text style={base.homeModel}>
            {d.homeName} · {d.stockNo}
          </Text>
          {d.deliveryDate && (
            <Text style={[base.homeSpecs, { color: C.mute }]}>
              Delivery: {new Date(d.deliveryDate).toLocaleDateString()}
            </Text>
          )}

          <PreparedFor
            name={d.customerName}
            phone={d.customerPhone}
            email={d.customerEmail}
          />

          <LineItemsTable
            label="Order Details"
            items={d.lineItems}
            totalCents={d.totalCents}
            totalLabel="Order Total"
          />

          {d.terms && (
            <>
              <Text style={base.sectionLabel}>Terms</Text>
              <Text style={{ fontSize: 10, color: C.ink, lineHeight: 1.5 }}>
                {d.terms}
              </Text>
            </>
          )}

          <NotesSection notes={d.notes} />
        </View>

        <PdfFooter />
      </Page>
    </Document>
  );
}

export async function renderPoPdf(d: PoPdfData): Promise<Buffer> {
  const blob = await pdf(<PoDocument d={d} />).toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
