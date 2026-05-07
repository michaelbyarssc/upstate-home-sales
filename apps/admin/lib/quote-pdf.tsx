/**
 * Server-side PDF generator for customer quotes.
 *
 * Uses @react-pdf/renderer in a Node runtime (server action) — never imported
 * by client components. Returns a Buffer suitable for direct upload to the
 * `quote-pdfs` Supabase Storage bucket.
 */

import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#0f1c29',
  },
  brandBar: {
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#dad3c1',
  },
  orgName: {
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: '#b9532a',
    marginBottom: 6,
  },
  title: {
    fontSize: 32,
    fontFamily: 'Times-Roman',
  },
  homeLine: {
    marginTop: 6,
    fontSize: 12,
    color: '#3a4248',
  },
  block: { marginTop: 24 },
  blockH: {
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#6b6863',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#dad3c1',
  },
  price: {
    fontSize: 36,
    fontFamily: 'Times-Roman',
    color: '#0f1c29',
  },
  priceMeta: {
    fontSize: 9,
    color: '#6b6863',
    marginTop: 4,
  },
  validFor: {
    fontSize: 24,
    fontFamily: 'Times-Roman',
    textAlign: 'right',
  },
  specs: { marginTop: 18 },
  specRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#efeae0',
  },
  specLbl: {
    width: 130,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#6b6863',
  },
  specVal: { flex: 1, fontSize: 11 },
  para: {
    marginTop: 14,
    fontSize: 10,
    lineHeight: 1.5,
    color: '#3a4248',
  },
  next: {
    marginTop: 24,
    padding: 14,
    backgroundColor: '#f6f1e6',
    borderRadius: 4,
  },
  nextH: { fontSize: 11, marginBottom: 6 },
  nextItem: {
    fontSize: 10,
    color: '#3a4248',
    marginBottom: 3,
    lineHeight: 1.5,
  },
  footer: {
    position: 'absolute',
    bottom: 36,
    left: 48,
    right: 48,
    fontSize: 8,
    color: '#6b6863',
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#dad3c1',
  },
});

export type QuotePdfData = {
  orgName: string;
  brandColor?: string | null;
  homeName: string;
  stockNo: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  headline: string | null;
  description: string | null;
  listedPriceCents: number;
  expiresAt: string;
  createdAt: string;
  publicUrl: string;
};

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function QuoteDocument({ q }: { q: QuotePdfData }) {
  const expires = new Date(q.expiresAt);
  const created = new Date(q.createdAt);
  const daysLeft = Math.max(
    0,
    Math.ceil((expires.getTime() - Date.now()) / 86_400_000),
  );

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.brandBar}>
          <Text style={styles.orgName}>{q.orgName}</Text>
          <Text style={styles.title}>Your quote</Text>
          <Text style={styles.homeLine}>
            {q.homeName} · {q.stockNo}
          </Text>
        </View>

        <View style={styles.block}>
          <View style={styles.priceRow}>
            <View>
              <Text style={styles.blockH}>Quoted price</Text>
              <Text style={styles.price}>{formatCents(q.listedPriceCents)}</Text>
              <Text style={styles.priceMeta}>
                Includes setup, delivery, and add-ons as itemized.
              </Text>
            </View>
            <View>
              <Text style={[styles.blockH, { textAlign: 'right' }]}>Valid for</Text>
              <Text style={styles.validFor}>{daysLeft} days</Text>
              <Text style={[styles.priceMeta, { textAlign: 'right' }]}>
                Expires {expires.toLocaleDateString()}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockH}>About this home</Text>
          {q.headline ? <Text style={styles.para}>{q.headline}</Text> : null}
          <View style={styles.specs}>
            <Spec lbl="Stock #" val={q.stockNo} />
            <Spec
              lbl="Beds / baths"
              val={`${q.beds ?? '—'} / ${q.baths ?? '—'}`}
            />
            <Spec
              lbl="Square feet"
              val={q.sqft != null ? q.sqft.toLocaleString() : '—'}
            />
            <Spec lbl="Quoted on" val={created.toLocaleDateString()} />
          </View>
          {q.description ? <Text style={styles.para}>{q.description}</Text> : null}
        </View>

        <View style={styles.next}>
          <Text style={styles.nextH}>Next steps</Text>
          <Text style={styles.nextItem}>
            1. Reply to the email this quote came from with any questions.
          </Text>
          <Text style={styles.nextItem}>
            2. Pre-qualify with one of our lender partners on the financing page.
          </Text>
          <Text style={styles.nextItem}>
            3. Schedule a walk-through at the lot — we&apos;re open seven days.
          </Text>
          <Text style={[styles.nextItem, { marginTop: 8 }]}>
            View this quote online: {q.publicUrl}
          </Text>
        </View>

        <Text style={styles.footer} fixed>
          Pricing snapshotted on {created.toLocaleDateString()}. The dealer&apos;s public listing
          price may change after this date — your quote stays at {formatCents(q.listedPriceCents)} through expiry.
        </Text>
      </Page>
    </Document>
  );
}

function Spec({ lbl, val }: { lbl: string; val: string }) {
  return (
    <View style={styles.specRow}>
      <Text style={styles.specLbl}>{lbl}</Text>
      <Text style={styles.specVal}>{val}</Text>
    </View>
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
