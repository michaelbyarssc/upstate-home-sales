/**
 * Shared PDF components for quotes and invoices.
 * Uses @react-pdf/renderer — server-side only.
 */

import { Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import type { LineItem } from '@uhs/db';

// ─── Brand tokens ─────────────────────────────────────────────────────────
export const C = {
  navy: '#0f1c29',
  brick: '#b9532a',
  cream: '#f6efe6',
  creamDark: '#efeae0',
  ink: '#1a2a3a',
  mute: '#6b6863',
  line: '#dad3c1',
  white: '#ffffff',
};

// ─── Shared styles ────────────────────────────────────────────────────────
export const base = StyleSheet.create({
  page: {
    padding: 0,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: C.ink,
  },

  // Header bar
  headerBar: {
    backgroundColor: C.navy,
    padding: '24px 48px 20px',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {},
  orgName: {
    fontSize: 22,
    fontFamily: 'Times-Roman',
    color: C.white,
    marginBottom: 4,
  },
  orgSub: {
    fontSize: 9,
    color: '#8a9baa',
    letterSpacing: 0.6,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  badge: {
    backgroundColor: C.brick,
    color: C.white,
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 2,
    padding: '5px 14px',
    borderRadius: 3,
    marginBottom: 6,
  },
  headerDate: {
    fontSize: 9,
    color: '#8a9baa',
  },

  // Accent bar under header
  accentBar: {
    height: 3,
    backgroundColor: C.brick,
  },

  // Body area — bottom padding must clear the fixed footer (~55px)
  body: {
    padding: '24px 48px 80px',
  },

  // Home info
  homeName: {
    fontSize: 26,
    fontFamily: 'Times-Roman',
    color: C.ink,
    marginBottom: 4,
  },
  homeModel: {
    fontSize: 10,
    color: C.mute,
    marginBottom: 2,
  },
  homeSpecs: {
    fontSize: 10,
    color: C.brick,
    marginTop: 2,
  },

  // Prepared-for box
  preparedBox: {
    marginTop: 20,
    padding: '14px 16px',
    backgroundColor: '#f4f2ed',
    borderLeftWidth: 3,
    borderLeftColor: C.brick,
  },
  preparedLabel: {
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: C.mute,
    marginBottom: 6,
  },
  preparedName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: C.ink,
    marginBottom: 4,
  },
  preparedContact: {
    fontSize: 10,
    color: C.mute,
  },

  // Section headers
  sectionLabel: {
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: C.mute,
    marginTop: 22,
    marginBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
    paddingBottom: 4,
  },

  // Line items table
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 4,
    marginBottom: 2,
  },
  tableHeaderText: {
    fontSize: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: C.mute,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tableRowAlt: {
    backgroundColor: '#faf8f4',
  },
  tableDesc: {
    fontSize: 11,
    color: C.ink,
    flex: 1,
  },
  tableAmount: {
    fontSize: 11,
    color: C.ink,
    textAlign: 'right',
    width: 120,
  },

  // Total callout
  totalBox: {
    marginTop: 10,
    padding: '12px 16px',
    backgroundColor: C.cream,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: C.mute,
  },
  totalAmount: {
    fontSize: 28,
    fontFamily: 'Times-Roman',
    color: C.brick,
  },

  // Notes
  noteItem: {
    fontSize: 10,
    color: C.ink,
    marginBottom: 4,
    lineHeight: 1.5,
    paddingLeft: 10,
  },
  bullet: {
    fontSize: 10,
    color: C.brick,
    marginRight: 6,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  footerAccent: {
    height: 3,
    backgroundColor: C.brick,
  },
  footerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: '10px 48px',
    backgroundColor: C.navy,
  },
  footerLeft: {},
  footerOrgName: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
    marginBottom: 2,
  },
  footerTagline: {
    fontSize: 8,
    color: '#8a9baa',
    fontStyle: 'italic',
  },
  footerRight: {
    alignItems: 'flex-end',
  },
  footerLink: {
    fontSize: 8,
    color: '#8a9baa',
    marginBottom: 1,
  },
});

// ─── Reusable components ──────────────────────────────────────────────────

export function PdfHeader({
  orgName,
  docType,
  date,
}: {
  orgName: string;
  docType: 'QUOTE' | 'INVOICE';
  date: string;
}) {
  return (
    <>
      <View style={base.headerBar}>
        <View style={base.headerLeft}>
          <Text style={base.orgName}>{orgName}</Text>
          <Text style={base.orgSub}>South Carolina · Est. 2024</Text>
        </View>
        <View style={base.headerRight}>
          <Text style={base.badge}>{docType}</Text>
          <Text style={base.headerDate}>{date}</Text>
        </View>
      </View>
      <View style={base.accentBar} />
    </>
  );
}

export function PreparedFor({
  name,
  phone,
  email,
}: {
  name: string | null;
  phone: string | null;
  email: string | null;
}) {
  if (!name && !phone && !email) return null;
  const contactParts = [phone, email].filter(Boolean).join('  ·  ');
  return (
    <View style={base.preparedBox}>
      <Text style={base.preparedLabel}>Prepared For</Text>
      {name && <Text style={base.preparedName}>{name}</Text>}
      {contactParts && <Text style={base.preparedContact}>{contactParts}</Text>}
    </View>
  );
}

export function LineItemsTable({
  label,
  items,
  totalCents,
  totalLabel,
}: {
  label: string;
  items: LineItem[];
  totalCents: number;
  totalLabel?: string;
}) {
  return (
    <>
      <Text style={base.sectionLabel}>{label}</Text>
      <View style={base.tableHeader}>
        <Text style={base.tableHeaderText}>Description</Text>
        <Text style={[base.tableHeaderText, { textAlign: 'right' }]}>Amount</Text>
      </View>
      {items.map((item, i) => (
        <View
          key={`${item.description}-${i}`}
          style={[base.tableRow, i % 2 === 0 ? base.tableRowAlt : {}]}
        >
          <Text style={base.tableDesc}>{item.description}</Text>
          <Text style={base.tableAmount}>
            {item.amount_cents != null ? fmtCents(item.amount_cents) : ''}
          </Text>
        </View>
      ))}
      <View style={base.totalBox}>
        <Text style={base.totalLabel}>{totalLabel ?? 'Estimated Total'}</Text>
        <Text style={base.totalAmount}>{fmtCents(totalCents)}</Text>
      </View>
    </>
  );
}

export function NotesSection({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <View wrap={false} minPresenceAhead={40}>
      <Text style={base.sectionLabel}>Notes</Text>
      {notes.map((n, i) => (
        <View key={i} style={{ flexDirection: 'row', marginBottom: 4, paddingLeft: 4 }}>
          <Text style={base.bullet}>•</Text>
          <Text style={base.noteItem}>{n}</Text>
        </View>
      ))}
    </View>
  );
}

export function PdfFooter() {
  return (
    <View style={base.footer} fixed>
      <View style={base.footerAccent} />
      <View style={base.footerContent}>
        <View style={base.footerLeft}>
          <Text style={base.footerOrgName}>Upstate Home Sales</Text>
          <Text style={base.footerTagline}>Built well. Priced honestly. Delivered to your land.</Text>
        </View>
        <View style={base.footerRight}>
          <Text style={base.footerLink}>upstatehomesales.com</Text>
          <Text style={base.footerLink}>info@upstatehomesales.com</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

export function fmtCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ─── V2 Quote Components ─────────────────────────────────────────────────

const v2 = StyleSheet.create({
  // Header
  headerBar: {
    backgroundColor: C.navy,
    padding: '28px 48px 22px',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Times-Bold',
    color: C.white,
    letterSpacing: 1,
    marginBottom: 4,
  },
  headerSub: {
    fontSize: 10,
    color: '#a0aab4',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerDateLabel: {
    fontSize: 9,
    color: '#a0aab4',
    marginBottom: 2,
  },
  headerPrepLabel: {
    fontSize: 9,
    color: '#a0aab4',
    marginTop: 4,
  },
  headerPrepName: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
  },
  headerContact: {
    fontSize: 9,
    color: '#a0aab4',
    marginTop: 1,
  },

  // Body
  body: {
    padding: '24px 48px 70px',
  },

  // Section labels
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: C.brick,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },

  // Prepared For
  prepName: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: C.ink,
    marginBottom: 4,
  },
  prepContact: {
    fontSize: 10,
    color: C.mute,
    marginBottom: 16,
  },

  // Home details
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    marginBottom: 16,
  },
  homeName: {
    fontSize: 24,
    fontFamily: 'Times-Bold',
    color: C.ink,
  },
  homeModel: {
    fontSize: 18,
    fontFamily: 'Times-Roman',
    color: C.mute,
    marginLeft: 10,
  },
  homeSpecs: {
    fontSize: 10,
    color: C.mute,
    marginTop: 4,
    marginBottom: 16,
  },

  // Photo grid
  photoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  photoCell: {
    flex: 1,
  },
  photoImage: {
    width: '100%',
    height: 130,
    objectFit: 'cover',
  },
  photoCaptionBar: {
    backgroundColor: '#2c4a8a',
    padding: '4px 8px',
  },
  photoCaptionText: {
    fontSize: 8,
    color: C.white,
    textAlign: 'center',
    fontFamily: 'Helvetica-Bold',
  },

  // Land & financing box
  landBox: {
    backgroundColor: '#f8f0e8',
    padding: '12px 16px',
    marginTop: 12,
  },
  landLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.brick,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  landText: {
    fontSize: 10,
    color: C.ink,
    lineHeight: 1.4,
  },

  // Footer
  footerBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  footerAccent: {
    height: 3,
    backgroundColor: C.brick,
  },
  footerContent: {
    backgroundColor: C.navy,
    padding: '12px 48px 10px',
    alignItems: 'center',
  },
  footerOrgName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
    marginBottom: 3,
  },
  footerContactLine: {
    fontSize: 9,
    color: '#a0aab4',
    marginBottom: 6,
  },
  footerDisclaimer: {
    fontSize: 7,
    color: '#707a84',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 1.4,
  },

  // Flat rate pricing
  priceBox: {
    backgroundColor: C.navy,
    padding: '20px 24px 16px',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceAmount: {
    fontSize: 42,
    fontFamily: 'Times-Bold',
    color: C.white,
    marginBottom: 4,
  },
  priceSub: {
    fontSize: 10,
    color: '#a0aab4',
  },

  // Checklist
  checkRow: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 8,
  },
  checkMark: {
    fontSize: 12,
    color: C.brick,
    marginRight: 10,
    marginTop: 1,
  },
  checkContent: {
    flex: 1,
  },
  checkTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: C.ink,
    marginBottom: 1,
  },
  checkSub: {
    fontSize: 9,
    color: C.mute,
  },

  // Footnote
  footnote: {
    fontSize: 8,
    color: C.mute,
    fontStyle: 'italic',
    marginTop: 8,
    paddingLeft: 8,
  },

  // Quote-for line
  quoteForLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 20,
  },
  quoteForLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.brick,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginRight: 12,
  },
  quoteForName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: C.ink,
    marginRight: 8,
  },
  quoteForHome: {
    fontSize: 12,
    color: C.mute,
  },

  // Itemized table
  itemTableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: C.navy,
    padding: '8px 12px',
  },
  itemTableHeaderText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  itemTableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
  },
  itemTableRowAlt: {
    backgroundColor: '#f5f2ee',
  },
  itemTableDesc: {
    fontSize: 10,
    color: C.ink,
    flex: 1,
  },
  itemTableAmount: {
    fontSize: 10,
    color: C.ink,
    textAlign: 'right',
    width: 100,
  },
  itemTableTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.navy,
    padding: '10px 12px',
  },
  itemTableTotalLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  itemTableTotalAmount: {
    fontSize: 18,
    fontFamily: 'Times-Bold',
    color: C.white,
  },
});

export type PreparedBy = {
  name: string | null;
  phone: string | null;
  email: string | null;
};

export type PhotoItem = {
  url: string;
  caption: string | null;
};

export function PdfHeaderV2({
  date,
  preparedBy,
}: {
  date: string;
  preparedBy: PreparedBy;
}) {
  return (
    <>
      <View style={v2.headerBar}>
        <View>
          <Text style={v2.headerTitle}>UPSTATE HOME SALES</Text>
          <Text style={v2.headerSub}>Quality Manufactured Homes &bull; South Carolina</Text>
        </View>
        <View style={v2.headerRight}>
          <Text style={v2.headerDateLabel}>Quote Date: {date}</Text>
          {preparedBy.name && (
            <>
              <Text style={v2.headerPrepLabel}>Prepared by:</Text>
              <Text style={v2.headerPrepName}>{preparedBy.name}</Text>
            </>
          )}
          {(preparedBy.phone || preparedBy.email) && (
            <Text style={v2.headerContact}>
              {[preparedBy.phone, preparedBy.email].filter(Boolean).join(' \u2022 ')}
            </Text>
          )}
        </View>
      </View>
      <View style={base.accentBar} />
    </>
  );
}

export function PdfFooterV2({ preparedBy }: { preparedBy: PreparedBy }) {
  return (
    <View style={v2.footerBar} fixed>
      <View style={v2.footerAccent} />
      <View style={v2.footerContent}>
        <Text style={v2.footerOrgName}>UPSTATE HOME SALES</Text>
        <Text style={v2.footerContactLine}>
          {[preparedBy.name, preparedBy.phone, preparedBy.email].filter(Boolean).join(' \u2022 ')}
        </Text>
        <Text style={v2.footerDisclaimer}>
          Prices are estimates and subject to change. This is not a binding contract.
        </Text>
        <Text style={v2.footerDisclaimer}>
          Financing subject to credit approval. Land roll-in subject to lender requirements.
        </Text>
      </View>
    </View>
  );
}

export function HomeDetailsSection({
  customerName,
  customerPhone,
  customerEmail,
  homeName,
  modelNumber,
  manufacturer,
  beds,
  baths,
  homeType,
}: {
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  homeName: string;
  modelNumber: string | null;
  manufacturer: string | null;
  beds: number | null;
  baths: number | null;
  homeType: string | null;
}) {
  const contactParts = [customerPhone, customerEmail].filter(Boolean).join('  \u2022  ');
  const specsLine = [
    manufacturer ? `Built by ${manufacturer}` : null,
    beds != null && baths != null ? `${beds} Bed / ${baths} Bath` : null,
    homeType ?? 'Manufactured Home',
  ]
    .filter(Boolean)
    .join('  \u2022  ');

  return (
    <>
      <Text style={v2.sectionLabel}>QUOTE PREPARED FOR</Text>
      {customerName && <Text style={v2.prepName}>{customerName}</Text>}
      {contactParts && <Text style={v2.prepContact}>{contactParts}</Text>}

      <View style={v2.divider} />

      <Text style={v2.sectionLabel}>HOME DETAILS</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 2 }}>
        <Text style={v2.homeName}>{homeName}</Text>
        {modelNumber && <Text style={v2.homeModel}>Model {modelNumber}</Text>}
      </View>
      {specsLine && <Text style={v2.homeSpecs}>{specsLine}</Text>}
    </>
  );
}

export function PhotoGrid({ photos }: { photos: PhotoItem[] }) {
  if (photos.length === 0) return null;

  const rows: PhotoItem[][] = [];
  for (let i = 0; i < photos.length; i += 2) {
    rows.push(photos.slice(i, i + 2));
  }

  return (
    <>
      <Text style={v2.sectionLabel}>HOME PHOTOS</Text>
      {rows.map((row, ri) => (
        <View key={ri} style={v2.photoRow} wrap={false}>
          {row.map((photo, ci) => (
            <View key={ci} style={v2.photoCell}>
              <Image src={photo.url} style={v2.photoImage} />
              <View style={v2.photoCaptionBar}>
                <Text style={v2.photoCaptionText}>{photo.caption || 'Photo'}</Text>
              </View>
            </View>
          ))}
          {row.length === 1 && <View style={v2.photoCell} />}
        </View>
      ))}
    </>
  );
}

export function LandFinancingBox() {
  return (
    <View style={v2.landBox} wrap={false}>
      <Text style={v2.landLabel}>LAND &amp; FINANCING</Text>
      <Text style={v2.landText}>
        Customer supplies the land. Land can be rolled into the loan if approved.
      </Text>
    </View>
  );
}

export function FlatRatePricingSection({
  items,
  totalCents,
  homeName,
  modelNumber,
}: {
  items: LineItem[];
  totalCents: number;
  homeName: string;
  modelNumber: string | null;
}) {
  return (
    <>
      <Text style={v2.sectionLabel}>YOUR ALL-INCLUSIVE QUOTE</Text>
      <View style={v2.priceBox}>
        <Text style={v2.priceAmount}>{fmtCents(totalCents)}</Text>
        <Text style={v2.priceSub}>
          Total price &bull; Excludes Water Tap (county cost: $2,500 &ndash; $6,000)
        </Text>
      </View>

      <Text style={[v2.sectionLabel, { marginTop: 16 }]}>WHAT&apos;S INCLUDED</Text>
      {items.map((item, i) => (
        <View key={i} style={v2.checkRow}>
          <Text style={v2.checkMark}>{'\u2713'}</Text>
          <View style={v2.checkContent}>
            <Text style={v2.checkTitle}>{item.description}</Text>
            {item.subtitle && <Text style={v2.checkSub}>{item.subtitle}</Text>}
          </View>
        </View>
      ))}
      <Text style={v2.footnote}>
        * Water Tap is an additional county cost, typically $2,500 &ndash; $6,000
      </Text>
    </>
  );
}

export function ItemizedPricingSection({
  items,
  totalCents,
}: {
  items: LineItem[];
  totalCents: number;
}) {
  return (
    <>
      <Text style={v2.sectionLabel}>ITEMIZED PRICING BREAKDOWN</Text>
      <View style={v2.itemTableHeader}>
        <Text style={v2.itemTableHeaderText}>Description</Text>
        <Text style={[v2.itemTableHeaderText, { textAlign: 'right' }]}>Amount</Text>
      </View>
      {items.map((item, i) => (
        <View key={i} style={[v2.itemTableRow, i % 2 === 0 ? v2.itemTableRowAlt : {}]}>
          <Text style={v2.itemTableDesc}>{item.description}</Text>
          <Text style={v2.itemTableAmount}>
            {item.amount_cents != null ? fmtCents(item.amount_cents) : 'Included'}
          </Text>
        </View>
      ))}
      <View style={v2.itemTableTotal}>
        <Text style={v2.itemTableTotalLabel}>Total</Text>
        <Text style={v2.itemTableTotalAmount}>{fmtCents(totalCents)}</Text>
      </View>
    </>
  );
}
