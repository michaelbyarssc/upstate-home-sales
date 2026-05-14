/**
 * Shared PDF components for quotes and invoices.
 * Uses @react-pdf/renderer — server-side only.
 */

import { Text, View, StyleSheet } from '@react-pdf/renderer';
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
