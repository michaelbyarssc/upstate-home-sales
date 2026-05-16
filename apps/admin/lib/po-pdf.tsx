/**
 * Server-side PDF generator for purchase orders.
 * Faithful rendering of South Carolina "Form 500" / Manufactured Home
 * Purchase Agreement: page 1 = deal info + buyer info + line items + totals
 * + signatures; pages 2-4 = numbered Terms and Conditions verbatim.
 */

import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import type { LineItem } from '@uhs/db';

export type PoPdfData = {
  orgName: string;
  orgAddressLines?: string[];   // e.g. ['280 Gossett Rd', 'Spartanburg, SC 29307', '(864) 680-4030']
  orgPhone?: string | null;
  dealerLicense?: string | null;

  poNumber: number;
  housingConsultant?: string | null;
  createdAt: string;            // ISO

  // Buyer / co-buyer info
  customerName: string | null;
  coBuyerName?: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  deliveryZip?: string | null;
  mailingAddress?: string | null;

  // Home / unit
  homeName: string;
  stockNo: string;
  manufacturer?: string | null;
  modelNumber?: string | null;
  approxSize?: string | null;   // e.g. "32x76"
  year?: number | string | null;
  beds?: number | null;
  baths?: number | null;
  serialNo?: string | null;

  // Line items / pricing
  lineItems: LineItem[];        // add-ons (left-side table)
  totalCents: number;           // sum of line items (TOTAL ADD-ONS)
  homePriceCents?: number;      // Price of home (pre-tax)
  salesTaxCents?: number;
  feesCents?: number;
  tradeInAllowanceCents?: number;
  tradeInBalanceOwedCents?: number;
  cashDepositCents?: number;
  cashAsAgreedCents?: number;

  // Free-form
  notes: string[];
  terms: string | null;
  deliveryDate: string | null;
};

// ─── Colors / styles ────────────────────────────────────────────────────────
const ink = '#111';
const line = '#111';
const mute = '#444';
const gray = '#f4f4f4';
const yellow = '#fff200';
const cents = (n: number | null | undefined) =>
  (((n ?? 0) / 100)).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const S = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 30,
    paddingLeft: 20,
    paddingRight: 20,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: ink,
    lineHeight: 1.2,
  },
  // ─── Page 1 header
  topGrid: { flexDirection: 'row', marginBottom: 8 },
  logoCell: {
    width: 140, alignItems: 'center', justifyContent: 'center',
    color: '#183f63', fontFamily: 'Helvetica-Bold', fontSize: 18, textAlign: 'center',
  },
  dealerName: {
    flex: 1, paddingLeft: 8, paddingRight: 8, alignItems: 'center', justifyContent: 'center',
  },
  dealerNameText: {
    fontFamily: 'Helvetica-Bold', fontSize: 12, textAlign: 'center', lineHeight: 1.35,
  },
  dealerDetails: { width: 200, fontSize: 9 },
  dealerDetailRow: {
    flexDirection: 'row', alignItems: 'flex-end', minHeight: 14, marginBottom: 2,
  },
  dealerDetailLabel: { fontFamily: 'Helvetica-Bold', width: 96 },
  dealerDetailValue: {
    flex: 1, borderBottomWidth: 1, borderBottomColor: line, paddingLeft: 4, paddingBottom: 1,
  },
  heading: { fontFamily: 'Helvetica-Bold', fontSize: 16, textAlign: 'center', marginBottom: 6 },

  // ─── Buyer info table
  buyerTable: { borderWidth: 1, borderColor: line, marginBottom: 6 },
  buyerRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: line },
  buyerRowLast: { flexDirection: 'row' },
  buyerCell: {
    paddingTop: 2, paddingBottom: 2, paddingLeft: 3, paddingRight: 3,
    borderRightWidth: 1, borderRightColor: line,
  },
  buyerCellLast: {
    paddingTop: 2, paddingBottom: 2, paddingLeft: 3, paddingRight: 3,
  },
  buyerLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  buyerValue: { fontSize: 9, minHeight: 11 },

  // ─── Two-column body
  twoCol: { flexDirection: 'row' },
  colLeft: { flex: 1, paddingRight: 4 },
  colRight: { flex: 1.15, paddingLeft: 4 },

  sectionTitle: {
    fontSize: 7, fontFamily: 'Helvetica-Bold', borderWidth: 1, borderColor: line,
    paddingTop: 2, paddingBottom: 2, paddingLeft: 4,
  },

  // ─── Add-ons table
  addonsTable: { borderWidth: 1, borderColor: line, borderTopWidth: 0 },
  addonRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: line, minHeight: 16 },
  addonRowLast: { flexDirection: 'row', minHeight: 16 },
  addonDesc: { flex: 1, padding: 2, fontSize: 9 },
  addonAmt: { width: 70, padding: 2, textAlign: 'right', fontSize: 9, borderLeftWidth: 1, borderLeftColor: line },
  addonTotalLabel: { flex: 1, padding: 2, fontFamily: 'Helvetica-Bold', textAlign: 'right', fontSize: 9 },

  // ─── Terms-notes boxes
  termsNote: {
    borderWidth: 1, borderColor: line, padding: 3, marginTop: 3, fontSize: 7.5, lineHeight: 1.15,
  },
  termsInitial: { fontFamily: 'Helvetica-Bold', textAlign: 'right', fontSize: 7 },

  // ─── Pricing breakdown table
  priceTable: { borderWidth: 1, borderColor: line },
  priceRow: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: line, minHeight: 14,
  },
  priceLabel: {
    flex: 1, padding: 2, fontFamily: 'Helvetica-Bold', fontSize: 8.5,
    borderRightWidth: 1, borderRightColor: line,
  },
  priceLabelSmall: {
    flex: 1, padding: 2, fontSize: 7.5,
    borderRightWidth: 1, borderRightColor: line,
  },
  priceValue: { width: 90, padding: 2, textAlign: 'right', fontSize: 9, fontFamily: 'Helvetica-Bold' },

  // ─── Trade-in
  tradeTable: { borderWidth: 1, borderColor: line, marginTop: 4 },
  tradeRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: line, minHeight: 16 },
  tradeCell: {
    flex: 1, padding: 2, fontSize: 7.5, borderRightWidth: 1, borderRightColor: line,
  },
  tradeCellLast: { flex: 1, padding: 2, fontSize: 7.5 },

  centerBoldBox: {
    borderWidth: 1, borderColor: line, padding: 3, marginTop: 4, fontSize: 7.5,
    fontFamily: 'Helvetica-Bold', textAlign: 'center',
  },
  smallBox: {
    borderWidth: 1, borderColor: line, padding: 3, marginTop: 4, fontSize: 7.5, lineHeight: 1.2,
  },

  // ─── Signatures
  finePrint: { fontSize: 7.5, marginTop: 6 },
  signatureGrid: { flexDirection: 'row', marginTop: 10, marginBottom: 4 },
  signatureCol: { flex: 1, paddingRight: 12 },
  signatureLabel: { fontFamily: 'Helvetica-Bold', fontSize: 9, marginBottom: 16 },
  signatureLine: { borderBottomWidth: 1, borderBottomColor: line, height: 12, marginBottom: 4 },

  // ─── Footer
  footer: {
    position: 'absolute', left: 20, right: 20, bottom: 12,
    flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5,
  },

  // ─── Terms pages 2-4
  termsHeader: {
    borderWidth: 1, borderColor: line, backgroundColor: yellow,
    paddingTop: 4, paddingBottom: 4, paddingLeft: 6, paddingRight: 6,
    fontFamily: 'Helvetica-Bold', fontSize: 11, marginTop: 6, marginBottom: 8,
  },
  termsSubhead: { fontFamily: 'Helvetica-Bold', fontSize: 10, textAlign: 'center', marginBottom: 6 },
  termPara: {
    fontFamily: 'Times-Roman', fontSize: 10, lineHeight: 1.15, marginBottom: 6, textAlign: 'justify',
  },
  termHeading: { fontFamily: 'Times-Bold' },
  termNum: { fontFamily: 'Helvetica', fontWeight: 400, marginRight: 2 },
  initials: {
    position: 'absolute', left: 20, right: 20, bottom: 36,
    flexDirection: 'row', justifyContent: 'center', fontFamily: 'Helvetica-Bold', fontSize: 10,
  },
  initialsGap: { width: 60 },
});

// ─── Helpers ────────────────────────────────────────────────────────────────
function PageFooter({ poNumber, runDate, orgName }: { poNumber: number; runDate: string; orgName: string }) {
  return (
    <View style={S.footer} fixed>
      <Text>
        Deal # {poNumber}
        {'\n'}
        Run Date: {runDate}
      </Text>
      <Text>{orgName}</Text>
    </View>
  );
}

function InitialsLine() {
  return (
    <View style={S.initials} fixed>
      <Text>X. BUYER INITIAL ____________________</Text>
      <View style={S.initialsGap} />
      <Text>X. CO-BUYER INITIAL ____________________</Text>
    </View>
  );
}

// ─── Document ───────────────────────────────────────────────────────────────
function Form500Document({ d }: { d: PoPdfData }) {
  const created = new Date(d.createdAt);
  const dateStr = created.toLocaleDateString('en-US');
  const runDate = dateStr;

  // Pricing math
  const homePriceCents = d.homePriceCents ?? 0;
  const salesTaxCents = d.salesTaxCents ?? 0;
  const subtotalCents = homePriceCents + salesTaxCents;
  const feesCents = d.feesCents ?? 0;
  const addonsCents = d.totalCents;
  const cashPriceCents = subtotalCents + feesCents + addonsCents;
  const tradeInAllowanceCents = d.tradeInAllowanceCents ?? 0;
  const tradeInBalOwedCents = d.tradeInBalanceOwedCents ?? 0;
  const netTradeCents = Math.max(0, tradeInAllowanceCents - tradeInBalOwedCents);
  const depositCents = d.cashDepositCents ?? 0;
  const cashAsAgreedCents = d.cashAsAgreedCents ?? 0;
  const totalCreditsCents = netTradeCents + depositCents + cashAsAgreedCents;
  const finalSubtotalCents = Math.max(0, cashPriceCents - totalCreditsCents);

  const addressLines = d.orgAddressLines && d.orgAddressLines.length > 0
    ? d.orgAddressLines
    : [d.orgName];

  return (
    <Document>
      {/* ────────────────────────────────────────────────────────────────────
          PAGE 1 — Deal info, buyer info, line items, totals, signatures
          ──────────────────────────────────────────────────────────────────── */}
      <Page size="LETTER" style={S.page}>
        <View style={S.topGrid}>
          <View style={S.logoCell}>
            <Text>UPSTATE</Text>
            <Text>HOME CENTER</Text>
          </View>
          <View style={S.dealerName}>
            {addressLines.map((l, i) => (
              <Text key={i} style={S.dealerNameText}>{l}</Text>
            ))}
          </View>
          <View style={S.dealerDetails}>
            <View style={S.dealerDetailRow}>
              <Text style={S.dealerDetailLabel}>DEAL #</Text>
              <Text style={S.dealerDetailValue}>{d.poNumber}</Text>
            </View>
            <View style={S.dealerDetailRow}>
              <Text style={S.dealerDetailLabel}>HOUSING CONSULTANT</Text>
              <Text style={S.dealerDetailValue}>{d.housingConsultant ?? ''}</Text>
            </View>
            <View style={S.dealerDetailRow}>
              <Text style={S.dealerDetailLabel}>DATE</Text>
              <Text style={S.dealerDetailValue}>{dateStr}</Text>
            </View>
            <View style={S.dealerDetailRow}>
              <Text style={S.dealerDetailLabel}>DEALER LICENSE</Text>
              <Text style={S.dealerDetailValue}>{d.dealerLicense ?? ''}</Text>
            </View>
            <View style={S.dealerDetailRow}>
              <Text style={S.dealerDetailLabel}>PHONE #</Text>
              <Text style={S.dealerDetailValue}>{d.orgPhone ?? ''}</Text>
            </View>
          </View>
        </View>

        <Text style={S.heading}>PURCHASE AGREEMENT</Text>

        {/* Buyer info table — 4 rows × variable cols */}
        <View style={S.buyerTable}>
          <View style={S.buyerRow}>
            <View style={[S.buyerCell, { flex: 4 }]}>
              <Text style={S.buyerLabel}>Buyer Name</Text>
              <Text style={S.buyerValue}>{d.customerName ?? ''}</Text>
            </View>
            <View style={[S.buyerCell, { flex: 3 }]}>
              <Text style={S.buyerLabel}>Co Buyer</Text>
              <Text style={S.buyerValue}>{d.coBuyerName ?? ''}</Text>
            </View>
            <View style={[S.buyerCellLast, { flex: 2 }]}>
              <Text style={S.buyerLabel}>Phone</Text>
              <Text style={S.buyerValue}>{d.customerPhone ?? ''}</Text>
            </View>
          </View>
          <View style={S.buyerRow}>
            <View style={[S.buyerCell, { flex: 4 }]}>
              <Text style={S.buyerLabel}>Delivery Address</Text>
              <Text style={S.buyerValue}>{d.deliveryAddress ?? ''}</Text>
            </View>
            <View style={[S.buyerCell, { flex: 2 }]}>
              <Text style={S.buyerLabel}>City</Text>
              <Text style={S.buyerValue}>{d.deliveryCity ?? ''}</Text>
            </View>
            <View style={[S.buyerCell, { flex: 1 }]}>
              <Text style={S.buyerLabel}>State</Text>
              <Text style={S.buyerValue}>{d.deliveryState ?? ''}</Text>
            </View>
            <View style={[S.buyerCellLast, { flex: 2 }]}>
              <Text style={S.buyerLabel}>Zip</Text>
              <Text style={S.buyerValue}>{d.deliveryZip ?? ''}</Text>
            </View>
          </View>
          <View style={S.buyerRow}>
            <View style={[S.buyerCell, { flex: 4 }]}>
              <Text style={S.buyerLabel}>Mailing Address</Text>
              <Text style={S.buyerValue}>{d.mailingAddress ?? ''}</Text>
            </View>
            <View style={[S.buyerCell, { flex: 3 }]}>
              <Text style={S.buyerLabel}>E-Mail</Text>
              <Text style={S.buyerValue}>{d.customerEmail ?? ''}</Text>
            </View>
            <View style={[S.buyerCellLast, { flex: 2 }]}>
              <Text style={S.buyerLabel}>Serial #</Text>
              <Text style={S.buyerValue}>{d.serialNo ?? ''}</Text>
            </View>
          </View>
          <View style={S.buyerRowLast}>
            <View style={[S.buyerCell, { flex: 3 }]}>
              <Text style={S.buyerLabel}>Manufacturer</Text>
              <Text style={S.buyerValue}>{d.manufacturer ?? ''}</Text>
            </View>
            <View style={[S.buyerCell, { flex: 2 }]}>
              <Text style={S.buyerLabel}>Model</Text>
              <Text style={S.buyerValue}>{d.modelNumber ?? d.homeName}</Text>
            </View>
            <View style={[S.buyerCell, { flex: 1 }]}>
              <Text style={S.buyerLabel}>Appr. Size W. Hitch</Text>
              <Text style={S.buyerValue}>{d.approxSize ?? ''}</Text>
            </View>
            <View style={[S.buyerCell, { flex: 1 }]}>
              <Text style={S.buyerLabel}>Year</Text>
              <Text style={S.buyerValue}>{d.year ?? ''}</Text>
            </View>
            <View style={[S.buyerCell, { flex: 1 }]}>
              <Text style={S.buyerLabel}>Beds</Text>
              <Text style={S.buyerValue}>{d.beds ?? ''}</Text>
            </View>
            <View style={[S.buyerCellLast, { flex: 1 }]}>
              <Text style={S.buyerLabel}>Baths</Text>
              <Text style={S.buyerValue}>{d.baths ?? ''}</Text>
            </View>
          </View>
        </View>

        {/* Two columns */}
        <View style={S.twoCol}>
          {/* ── Left: Included Options + 9 terms-notes ── */}
          <View style={S.colLeft}>
            <Text style={S.sectionTitle}>INCLUDED OPTIONS, EQUIPMENT, LABOR AND ACCESSORIES</Text>
            <View style={S.addonsTable}>
              {(d.lineItems.length > 0 ? d.lineItems : [...Array(5)].map(() => ({ description: '', amount_cents: null as number | null }))).map((it, i) => (
                <View key={i} style={S.addonRow}>
                  <Text style={S.addonDesc}>{it.description}</Text>
                  <Text style={S.addonAmt}>{it.amount_cents != null ? cents(it.amount_cents) : ''}</Text>
                </View>
              ))}
              <View style={S.addonRowLast}>
                <Text style={S.addonTotalLabel}>TOTAL ADD-ONS:</Text>
                <Text style={[S.addonAmt, { fontFamily: 'Helvetica-Bold' }]}>{cents(addonsCents)}</Text>
              </View>
            </View>

            {/* 9 Terms-notes boxes */}
            <View style={S.termsNote}>
              <Text>The Buyer understands that any new tariffs, taxes, or government-imposed fees applied after the date of this agreement may increase the final price of the home. Buyer agrees to be solely responsible for any such additional charges and understands that these charges must be paid prior to delivery or closing.</Text>
              <Text style={S.termsInitial}>X_______</Text>
            </View>
            <View style={S.termsNote}>
              <Text>Buyer is purchasing the manufactured home described above, including any optional equipment and accessories. Insurance is voluntary.</Text>
              <Text style={S.termsInitial}>X_______</Text>
            </View>
            <View style={S.termsNote}>
              <Text>The &quot;Unpaid Bal of Sales Price&quot; will be due and payable in full upon delivery of paid unit to dealer&apos;s sales center. Any said unit will not be moved or transported from the sales center until the entire balance is paid in full.</Text>
              <Text style={S.termsInitial}>X_______</Text>
            </View>
            <View style={S.termsNote}>
              <Text>Wheels, axles, lights, coupling, and drawbar used for delivery are not included in the sale and remain the property of the Dealer, unless otherwise stated in the agreement or required by law.</Text>
              <Text style={S.termsInitial}>X_______</Text>
            </View>
            <View style={S.termsNote}>
              <Text>Additional terms-including warranty, exclusions, and damage limitations- are on page two and are part of this Agreement as if written above the signatures.</Text>
              <Text style={S.termsInitial}>X_______</Text>
            </View>
            <View style={S.termsNote}>
              <Text>Buyer confirms any trade-in is free of claims unless noted.</Text>
              <Text style={S.termsInitial}>X_______</Text>
            </View>
            <View style={S.termsNote}>
              <Text>Lot model homes are sold &quot;As-Is&quot;. Any defects to the home that occur from decorating to customer traffic is NOT covered under warranty.</Text>
              <Text style={S.termsInitial}>X_______</Text>
            </View>
            <View style={S.termsNote}>
              <Text>Buyer is responsible for all setup, skirting, trim-out, A/C, utilities, decks, plumbing, septic, well, land improvements, and insurance.</Text>
              <Text style={S.termsInitial}>X_______</Text>
            </View>
            <View style={S.termsNote}>
              <Text>All deposits and/or down payments are final and non-refundable.</Text>
              <Text style={S.termsInitial}>X_______</Text>
            </View>
          </View>

          {/* ── Right: Pricing breakdown + trade-in + bottom boxes ── */}
          <View style={S.colRight}>
            <View style={S.priceTable}>
              {[
                ['PRICE OF HOME', cents(homePriceCents)],
                ['SALES TAX', cents(salesTaxCents)],
                ['SUBTOTAL', cents(subtotalCents)],
                ['NON-TAXABLE ITEMS', ''],
                ['VARIOUS FEES & INSURANCE', cents(feesCents)],
                ['TOTAL OPTIONS (ADD-ONS)', cents(addonsCents)],
                ['CASH PURCHASE PRICE', cents(cashPriceCents)],
                ['TRADE-IN ALLOWANCE', cents(tradeInAllowanceCents)],
              ].map(([label, val], i) => (
                <View key={i} style={S.priceRow}>
                  <Text style={S.priceLabel}>{label}</Text>
                  <Text style={S.priceValue}>{val}</Text>
                </View>
              ))}
              <View style={S.priceRow}>
                <Text style={S.priceLabelSmall}>Less BAL DUE on above</Text>
                <Text style={S.priceValue}>{cents(tradeInBalOwedCents)}</Text>
              </View>
              {[
                ['NET TRADE ALLOWANCE', cents(netTradeCents)],
                ['25% CASH DEPOSIT', cents(depositCents)],
                ['CASH AS AGREED', cents(cashAsAgreedCents)],
                ['TOTAL CREDITS', cents(totalCreditsCents)],
                ['SUBTOTAL', cents(finalSubtotalCents)],
              ].map(([label, val], i) => (
                <View key={i} style={S.priceRow}>
                  <Text style={S.priceLabel}>{label}</Text>
                  <Text style={S.priceValue}>{val}</Text>
                </View>
              ))}
              <View style={[S.priceRow, { borderBottomWidth: 0 }]}>
                <Text style={S.priceLabelSmall}>UNPAID BAL OF SALES PRICE DUE 20 DAYS BEFORE DELIVERY</Text>
                <Text style={S.priceValue}>{cents(finalSubtotalCents)}</Text>
              </View>
            </View>

            <View style={S.tradeTable}>
              <View style={S.tradeRow}>
                <Text style={[S.tradeCell, { flex: 4, fontSize: 7 }]}>Trade-in description:</Text>
              </View>
              <View style={S.tradeRow}>
                <View style={S.tradeCell}><Text>Make</Text><Text>{' '}</Text></View>
                <View style={S.tradeCell}><Text>Model</Text><Text>{' '}</Text></View>
                <View style={S.tradeCell}><Text>Year</Text><Text>{' '}</Text></View>
                <View style={S.tradeCellLast}><Text>Size</Text><Text>{' '}</Text></View>
              </View>
              <View style={S.tradeRow}>
                <View style={S.tradeCell}><Text>Beds/Baths</Text><Text>{' '}</Text></View>
                <View style={S.tradeCell}><Text>Title#</Text><Text>{' '}</Text></View>
                <View style={[S.tradeCellLast, { flex: 2 }]}><Text>Vin</Text><Text>{' '}</Text></View>
              </View>
              <View style={S.tradeRow}>
                <View style={S.tradeCell}>
                  <Text>Bal owed on trade-in</Text>
                  <Text>{cents(tradeInBalOwedCents)}</Text>
                </View>
                <View style={S.tradeCell}><Text>Owed to Whom</Text><Text>{' '}</Text></View>
                <View style={[S.tradeCellLast, { flex: 2 }]}>
                  <Text>Trade-in debt paid by:</Text>
                  <Text>[ ] Buyer   [ ] Dealer</Text>
                </View>
              </View>
            </View>

            <View style={S.centerBoldBox}>
              <Text>THE TERMS AND CONDITIONS APPEARING ON BOTH PAGES ARE PART OF THIS CONTRACT. PLEASE READ THEM CAREFULLY.</Text>
            </View>

            <View style={S.smallBox}>
              <Text>Purchaser(s) acknowledge that purchaser(s) signed the contract below. That purchaser(s) are voluntarily purchasing the above home, the optional equipment, accessories, and insurance, if included. Purchaser(s) received a copy of this contract at the time it was signed.</Text>
            </View>
          </View>
        </View>

        <Text style={S.finePrint}>
          Not valid unless signed by authorized representative of Seller. Approval by Seller is subject to acceptance by bank or finance company, if applicable.
        </Text>

        <View style={S.signatureGrid}>
          <View style={S.signatureCol}>
            <Text style={S.signatureLabel}>SELLER</Text>
            <View style={S.signatureLine} />
            <Text style={S.signatureLabel}>X. WITNESS</Text>
            <View style={S.signatureLine} />
          </View>
          <View style={S.signatureCol}>
            <Text style={S.signatureLabel}>X. PURCHASER</Text>
            <View style={S.signatureLine} />
            <Text style={S.signatureLabel}>X. PURCHASER</Text>
            <View style={S.signatureLine} />
          </View>
        </View>

        <PageFooter poNumber={d.poNumber} runDate={runDate} orgName={d.orgName} />
      </Page>

      {/* ────────────────────────────────────────────────────────────────────
          PAGE 2 — Terms 1–8
          ──────────────────────────────────────────────────────────────────── */}
      <Page size="LETTER" style={S.page}>
        <Text style={S.heading}>PURCHASE AGREEMENT</Text>
        <Text style={S.termsHeader}>TERMS AND CONDITIONS</Text>
        <Text style={S.termsSubhead}>Additional Terms and Conditions</Text>
        <Text style={[S.termPara, { textAlign: 'center' }]}>
          Buyer understands that the term &quot;Home&quot; used in this Agreement describes the
          Mobile/Manufactured Home or any item or combination of items as described. Buyer further agrees:
        </Text>

        <Text style={S.termPara}>
          <Text style={S.termNum}>1. </Text>
          <Text style={S.termHeading}>IF NOT A CASH TRANSACTION: </Text>
          If Buyer does not complete this purchase as a cash transaction, Buyer knows before delivery of the
          Home purchased, Buyer will secure financing or enter into a retail installment contract and sign a
          security agreement or other agreement as may be required to finance Buyer&apos;s purchase.
        </Text>

        <Text style={S.termPara}>
          <Text style={S.termNum}>2. </Text>
          <Text style={S.termHeading}>TITLE: </Text>
          Title to the Home purchased will remain in Dealer&apos;s possession until the agreed-upon purchase
          price is paid-in-full in cash, or Buyer has secured financing or signed a retail installment contract
          that has been accepted by a bank or finance company, at which time Title passes to Buyer even
          though the actual delivery of the Home purchased may be made at a later date.
        </Text>

        <Text style={S.termPara}>
          <Text style={S.termNum}>3. </Text>
          <Text style={S.termHeading}>TRADE-IN: </Text>
          If Buyer is trading in a used car, Manufactured Home, trailer, or other vehicle, Buyer will give
          Dealer the original bill of sale or the title to the trade-in. Buyer promises that any trade-in
          which Buyer gives is owned by Buyer and is free of any lien or other claim except as noted in this
          Agreement. Buyer promises that all taxes of every kind levied against the trade-in have been fully
          paid. If any government agency makes a levy or claims a tax lien or demand against the trade-in,
          Dealer may, at Dealer&apos;s option, either pay it and Buyer will reimburse Dealer on demand, or
          Dealer may add that amount to this Agreement as if it had been originally included.
        </Text>

        <Text style={S.termPara}>
          <Text style={S.termNum}>4. </Text>
          <Text style={S.termHeading}>REGISTRATION OR LICENSE OF TRADE-IN: </Text>
          If Buyer has a trade-in and it is registered or licensed in a state outside of the one where this
          order is written, Buyer will immediately have the trade-in registered or licensed in the state
          Dealer indicates and Buyer will pay any and all expenses and registration or licensing fees
          required. If Dealer handles the registration or licensing of the trade-in, Buyer will reimburse
          Dealer for the expense on demand or Dealer may add that amount to this Agreement as if it had been
          originally included.
        </Text>

        <Text style={S.termPara}>
          <Text style={S.termNum}>5. </Text>
          <Text style={S.termHeading}>REAPPRAISAL OF TRADE-IN: </Text>
          If Buyer is making a trade-in and it is not delivered to Dealer at the time of the original
          appraisal and if later, on delivery, it appears to Dealer that there have been material changes
          made in the furnishings or accessories, or in its general physical condition, Dealer may make a
          reappraisal. Buyer agrees this later appraisal value will then determine the allowance to be made
          for the trade-in.
        </Text>

        <Text style={S.termPara}>
          <Text style={S.termNum}>6. </Text>
          <Text style={S.termHeading}>FAILURE TO COMPLETE PURCHASE: </Text>
          If Buyer fails or refuses to complete this purchase within the time frame specified in this
          Agreement or as specified in the Uniform Commercial Code of the state in which Buyer signs this
          Agreement, or within an agreed upon extension of time, for any reason (other than cancellation
          because of any price increase), Dealer may keep that portion of Buyer&apos;s cash deposit which
          will adequately compensate Dealer for Dealer&apos;s actual, consequential, and incidental damages,
          and all other damages, expenses or losses which Dealer incurs because Buyer failed to complete
          Buyer&apos;s purchase. If Buyer has not given Dealer a cash deposit or it is inadequate and Buyer
          has given Dealer a trade-in, Dealer may sell the trade-in at public or private sale, and deduct
          from the money received, an amount that will adequately compensate Dealer for any and all of the
          above-mentioned damages, expenses, or losses incurred because Buyer failed to complete this
          purchase. Retention of any portion of the cash deposit or the application of sale proceeds shall
          be in addition to, and not to the exclusion of, any other remedies Dealer may have at law, and
          this Agreement shall not be interpreted as containing a liquidated damages provision. Buyer
          understands that Dealer shall have all the rights of a seller upon breach of contract, under the
          Uniform Commercial Code, except the right to seek and collect &quot;liquidated damages&quot; under
          Section 11-2-718. If Dealer prevails in any legal action which Dealer brings against Buyer, or
          which Buyer brings against Dealer, concerning this Agreement, Buyer agrees to reimburse Dealer for
          Dealer&apos;s reasonable attorney&apos;s fees, court costs, and expenses which Dealer incurs in
          prosecuting/defending against that legal action.
        </Text>

        <Text style={S.termPara}>
          <Text style={S.termNum}>7. </Text>
          <Text style={S.termHeading}>CHANGES BY MANUFACTURER: </Text>
          Buyer understands that the Manufacturer may make any changes in the model, designs, accessories,
          or parts from time to time and at any time. If the Manufacturer does make changes, neither Dealer
          nor the Manufacturer are obligated to make the same changes in the Home that Buyer is purchasing,
          covered by this order, either before or after it is delivered to Buyer.
        </Text>

        <Text style={S.termPara}>
          <Text style={S.termNum}>8. </Text>
          <Text style={S.termHeading}>DELAYS: </Text>
          Buyer will not hold Dealer liable for delays caused by the Manufacturer, accidents, strikes,
          fires, or any other cause beyond Dealer&apos;s control.
        </Text>

        <InitialsLine />
        <PageFooter poNumber={d.poNumber} runDate={runDate} orgName={d.orgName} />
      </Page>

      {/* ────────────────────────────────────────────────────────────────────
          PAGE 3 — Terms 9–15
          ──────────────────────────────────────────────────────────────────── */}
      <Page size="LETTER" style={S.page}>
        <Text style={S.termPara}>
          <Text style={S.termNum}>9. </Text>
          <Text style={S.termHeading}>INSPECTION: </Text>
          Buyer has examined the product and finds it suitable for the Buyer&apos;s particular needs. Buyer
          has relied on Buyer&apos;s own judgment and inspection in determining that it is of acceptable
          quality. On the Home ordered, Buyer has relied on Buyer&apos;s inspection of the display model(s),
          the brochure and bulletins, and/or the floor plan provided to Dealer by the Manufacturer, in
          making Buyer&apos;s decision to purchase the Home described.
        </Text>

        <Text style={S.termPara}>
          <Text style={S.termNum}>10. </Text>
          <Text style={S.termHeading}>WARRANTIES AND EXCLUSIONS: </Text>
          Buyer understands that there may be written warranties covering the Home purchased, or any
          component(s), or any appliance(s) which have been provided by the Manufacturer that Dealer will
          provide if offered. Buyer has read and understood a statement of the type of warranty covering
          that Home purchased and/or component(s), and/or Appliance(s) before Buyer signed this Sales
          Agreement. There is no express warranty on used Homes. Except where prohibited by law: (i)
          Dealer&apos;s delivery of the Manufacturer&apos;s warranty of the Home purchased to Buyer, or any
          component(s), or any appliance(s) does not mean Dealer adopts the warranty(s) of such
          Manufacturer(s), (ii) Buyer acknowledges that these express warranties made by the
          Manufacturer(s) have not been made by the Dealer even if they say Dealer made them or say Dealer
          made some other express warranty, and (iii) Dealer is not an Agent of the Manufacturer(s) for
          warranty purposes even if Dealer completes, or attempts to complete, repairs for the
          Manufacturer(s). Except in IN, WV, MS, WI, or where otherwise prohibited by law: (i) Buyer
          understands that the implied warranties of merchantability and fitness for a particular purpose
          and all other warranties expressed or implied are excluded by Dealer from this transaction and
          shall not apply to the Home or any component or any appliance contained therein, and (ii) Buyer
          understands that Dealer makes no warranties whatsoever regarding this Home or any component or
          any appliance contained therein, and (iii) Buyer understands that Dealer disclaims and excludes
          from this transaction all warranty obligations which exceed or exist over and above the legal
          warranties required by applicable state law.
        </Text>

        <Text style={S.termPara}>
          <Text style={S.termNum}>11. </Text>
          <Text style={S.termHeading}>LIMITATION OF DAMAGES: </Text>
          Except in WV and any other state that does not allow the limitation of incidental and/or
          consequential damages, the following limitation of damages shall apply. If any warranty fails
          because of attempts at repair are not completed within a reasonable time, or any reason
          attributed to the Manufacturer, including Manufacturers who have gone out of business, Buyer
          agrees that if Buyer is entitled to any damages against Dealer, Buyer&apos;s damages are limited
          to the lesser of either the cost of needed repairs or reduction in the market value of the Home
          caused by the lack of repairs. Buyer also agrees that once Buyer has accepted the Home, even
          though the Manufacturer(s) warranty does not accomplish its purpose, Buyer cannot return the Home
          to Dealer and seek a refund for any reason.
        </Text>

        <Text style={S.termPara}>
          <Text style={S.termNum}>12. </Text>
          <Text style={S.termHeading}>INSURANCE: </Text>
          Buyer understands that Buyer is not covered by insurance on the Home purchased until accepted by
          an insurance company, and Buyer agrees to hold Dealer harmless from any and all claims due to
          loss or damage prior to acceptance of insurance coverage by an insurance company.
        </Text>

        <Text style={S.termPara}>
          <Text style={S.termNum}>13. </Text>
          <Text style={S.termHeading}>CONTROLLING LAW AND PLACE OF SUIT: </Text>
          The law of the state in which Buyer signs this Agreement is the law which is to be used in
          interpreting the terms of the Agreement. Dealer and Buyer agree that if any dispute is submitted
          to a court for resolution, such legal proceedings shall take place in the county in which
          Dealer&apos;s principal office is located. If under state law a special dispute resolution
          procedure or complaint process is available, Buyer agrees to the extent permitted by law that
          procedure shall be the only method of resolution and source of remedies available to Buyer.
        </Text>

        <Text style={S.termPara}>
          <Text style={S.termNum}>14. </Text>
          <Text style={S.termHeading}>PROVISIONS OF THIS AGREEMENT: </Text>
          Every provision of this Agreement is intended to be severable, and, if any term or provision is
          determined to be illegal or invalid for any reason whatsoever, such illegality or invalidity
          shall not affect the legality or validity of the remainder of this Agreement.
        </Text>

        <Text style={S.termPara}>
          <Text style={S.termNum}>15. </Text>
          <Text style={S.termHeading}>DELIVERY AND PLACEMENT: </Text>
          If Dealer has included delivery of the Home purchased in the purchase price, or if Dealer quotes
          a charge for delivery to Buyer&apos;s destination, Dealer&apos;s Agreement to transport the Home
          purchased, as well as Dealer&apos;s price quotation, is made in reliance based upon Buyer&apos;s
          assurance that travel is along acceptable all-weather surfaced roads, fully open and accessible,
          from point of origin to point of delivery, during the period required for transportation. Buyer
          assumes all responsibility for the proper preparation of Buyer&apos;s property to both receive
          and locate the Home purchased. If Dealer must hire extra labor and/or equipment in order to
          deliver and place the Home purchased because of something not previously disclosed to Dealer,
          Buyer will pay for all those additional costs. Buyer understands that Dealer does not guarantee
          proper placement of the Home unless concrete pier(s), running below the frost line and properly
          placed and level to permit a proper placement of the Home on the site, shall have first been
          prepared. Buyer will pay for all labor and material costs to re-set the Home when caused by
          future settling or sinking resulting from failure to provide a foundation approved by the State
          or Local Code in which the Home is sited. Buyer understands and agrees that the sewer shall be
          stubbed out of the ground, the waterline must be capped and the electric line connected to a
          meter pole with a proper receptacle within 20 feet of the electric box inside of the Home. Buyer
          understands and agrees that unless otherwise provided, the Home purchased is sold by Dealer
          F.O.B. Dealer&apos;s lot and Buyer is responsible for transporting it.
        </Text>

        <PageFooter poNumber={d.poNumber} runDate={runDate} orgName={d.orgName} />
      </Page>

      {/* ────────────────────────────────────────────────────────────────────
          PAGE 4 — Terms 16–19
          ──────────────────────────────────────────────────────────────────── */}
      <Page size="LETTER" style={S.page}>
        <Text style={S.termPara}>
          <Text style={S.termNum}>16. </Text>
          <Text style={S.termHeading}>CONNECTIONS, PERMITS, AND CHANGES: </Text>
          Buyer understands and agrees that Dealer is not permitted to make plumbing or electrical
          connections or connections of certain natural gas or propane appliances where state or local
          ordinance require a licensed plumber or electrician to do the work. Buyer understands and agrees
          that Dealer is not responsible for making changes to plumbing, electrical, or construction
          changes required by special building ordinances or laws. Buyer will pay the costs of any changes
          needed from compliance with local, county, or state laws or zoning requirements.
        </Text>

        <Text style={S.termPara}>
          <Text style={S.termNum}>17. </Text>
          <Text style={S.termHeading}>NOTICE OF WIDTH LIMITATIONS: </Text>
          Buyer has been informed of the length and width limitations, as of the date of this Agreement,
          now enforced in several States and Provinces of Canada, as they may apply to the transportation
          and delivery of manufactured homes and this Home over the public highways, and the fact that
          special permits are required. Buyer understands that some States and the Provinces of Canada may
          not grant the required permits where the size of the Home exceeds the statutory maximum. Buyer
          waives and releases and shall indemnify Dealer and Dealer&apos;s assigns, and the Manufacturer
          and its assigns, from any and all demands, suits, claims, or counterclaims, based on the size of
          the Home purchased, if it exceeds the limitations which are now or may later be, imposed by any
          State, Province, or any entity or level of government.
        </Text>

        <Text style={S.termPara}>
          <Text style={S.termNum}>18. </Text>
          <Text style={S.termHeading}>INSTALLATION: </Text>
          Buyer must retain a properly licensed and insured installer for the installation of any home
          purchased from Seller. Installation shall comply strictly with all applicable federal, state, and
          local laws, codes, and ordinances governing the installation location. No exceptions.
        </Text>

        <Text style={S.termPara}>
          <Text style={S.termNum}>19. </Text>
          <Text style={S.termHeading}>MCO: </Text>
          The Manufacturer&apos;s Certificate of Origin (MCO) will be sent to Buyer, signed and notarized,
          and may take up to 45 days after house delivery to be received.
        </Text>

        <PageFooter poNumber={d.poNumber} runDate={runDate} orgName={d.orgName} />
      </Page>
    </Document>
  );
}

export async function renderPoPdf(d: PoPdfData): Promise<Buffer> {
  const blob = await pdf(<Form500Document d={d} />).toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
