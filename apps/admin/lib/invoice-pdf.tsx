/**
 * Server-side PDF generator for customer invoices.
 * Uses @react-pdf/renderer — server-only.
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
  fmtCents,
} from './pdf-components';

export type InvoicePdfData = {
  orgName: string;
  brandColor?: string | null;
  invoiceNumber: number;
  homeName: string;
  stockNo: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  lineItems: LineItem[];
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  payments: Array<{
    amount_cents: number;
    method: string;
    paid_at: string;
    reference: string | null;
  }>;
  notes: string[];
  paymentTerms: string;
  paymentInstructions: string | null;
  dueAt: string | null;
  createdAt: string;
  publicUrl: string;
};

function InvoiceDocument({ d }: { d: InvoicePdfData }) {
  const created = new Date(d.createdAt);
  const dateStr = created.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Document>
      <Page size="LETTER" style={base.page}>
        <PdfHeader orgName={d.orgName} docType="INVOICE" date={dateStr} />

        <View style={base.body}>
          {/* Invoice number + home */}
          <Text style={base.homeName}>Invoice #{d.invoiceNumber}</Text>
          <Text style={base.homeModel}>
            {d.homeName} · {d.stockNo}
          </Text>
          {d.dueAt && (
            <Text style={[base.homeSpecs, { color: C.mute }]}>
              Due: {new Date(d.dueAt).toLocaleDateString()} · {d.paymentTerms}
            </Text>
          )}
          {!d.dueAt && (
            <Text style={[base.homeSpecs, { color: C.mute }]}>
              {d.paymentTerms}
            </Text>
          )}

          <PreparedFor
            name={d.customerName}
            phone={d.customerPhone}
            email={d.customerEmail}
          />

          {/* Line items */}
          <LineItemsTable
            label="Itemized Pricing"
            items={d.lineItems}
            totalCents={d.totalCents}
            totalLabel={d.paidCents > 0 ? 'Subtotal' : 'Total Due'}
          />

          {/* Payment history */}
          {d.payments.length > 0 && (
            <>
              <Text style={base.sectionLabel}>Payments Received</Text>
              {d.payments.map((p, i) => (
                <View
                  key={i}
                  style={[
                    base.tableRow,
                    i % 2 === 0 ? base.tableRowAlt : {},
                  ]}
                >
                  <Text style={base.tableDesc}>
                    {p.method.charAt(0).toUpperCase() + p.method.slice(1)}
                    {p.reference ? ` — ${p.reference}` : ''}
                    {' · '}
                    {new Date(p.paid_at).toLocaleDateString()}
                  </Text>
                  <Text style={[base.tableAmount, { color: '#166534' }]}>
                    -{fmtCents(p.amount_cents)}
                  </Text>
                </View>
              ))}
              <View style={base.totalBox}>
                <Text style={base.totalLabel}>Balance Due</Text>
                <Text style={base.totalAmount}>
                  {fmtCents(d.balanceCents)}
                </Text>
              </View>
            </>
          )}

          {/* Payment instructions */}
          {d.paymentInstructions && (
            <>
              <Text style={base.sectionLabel}>Payment Instructions</Text>
              <Text style={{ fontSize: 10, color: C.ink, lineHeight: 1.5 }}>
                {d.paymentInstructions}
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

export async function renderInvoicePdf(d: InvoicePdfData): Promise<Buffer> {
  const blob = await pdf(<InvoiceDocument d={d} />).toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
