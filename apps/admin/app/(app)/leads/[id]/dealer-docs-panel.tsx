'use client';

import { useState, useTransition } from 'react';
import { createClient } from '@uhs/db/browser';
import type { LineItem } from '@uhs/db';
import { setDocVisibility, deleteDealerDoc } from './actions';
import { InvoiceFormModal } from './invoice-form-modal';
import { PurchaseOrderFormModal } from './po-form-modal';
import type { HomeOption } from './quote-form-modal';

export type DealerDocRow = {
  kind: 'quote' | 'invoice' | 'po';
  id: string;
  title: string;
  homeId: string | null;
  homeName: string | null;
  totalCents: number;
  createdAt: string;
  secondaryDate: string | null;
  secondaryLabel: string;
  visibleToBuyer: boolean;
  pdfStoragePath: string | null;
  publicToken: string;
  publicHref: string;
  lineItems: LineItem[];
};

type Props = {
  leadId: string;
  orgId: string;
  homes: HomeOption[];
  defaultLineItems: LineItem[];
  initialDocs: DealerDocRow[];
};

const KIND_LABELS: Record<DealerDocRow['kind'], string> = {
  quote: 'Quote',
  invoice: 'Invoice',
  po: 'Purchase Order',
};

const KIND_BG: Record<DealerDocRow['kind'], { bg: string; color: string }> = {
  quote: { bg: '#dbeafe', color: '#1e40af' },
  invoice: { bg: '#fef3c7', color: '#854d0e' },
  po: { bg: '#dcfce7', color: '#166534' },
};

function fmtCents(c: number): string {
  return (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function DealerDocsPanel({ leadId, orgId, homes, defaultLineItems, initialDocs }: Props) {
  const [docs, setDocs] = useState(initialDocs);
  const [, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [convertSource, setConvertSource] = useState<{ kind: 'invoice' | 'po'; from: DealerDocRow } | null>(null);

  function toggleVisible(row: DealerDocRow) {
    const next = !row.visibleToBuyer;
    setDocs((prev) => prev.map((d) => (d.id === row.id && d.kind === row.kind ? { ...d, visibleToBuyer: next } : d)));
    startTransition(async () => {
      const r = await setDocVisibility({ kind: row.kind, id: row.id, leadId, visible: next });
      if (!r.ok) {
        setErr(r.error);
        // Roll back optimistic state.
        setDocs((prev) => prev.map((d) => (d.id === row.id && d.kind === row.kind ? { ...d, visibleToBuyer: !next } : d)));
      }
    });
  }

  function onDelete(row: DealerDocRow) {
    const label = `${KIND_LABELS[row.kind]} · ${row.title}`;
    if (!confirm(`Delete "${label}"? This removes the PDF from storage and is irreversible.`)) return;
    setDocs((prev) => prev.filter((d) => !(d.id === row.id && d.kind === row.kind)));
    startTransition(async () => {
      const r = await deleteDealerDoc({ kind: row.kind, id: row.id, leadId });
      if (!r.ok) {
        setErr(r.error);
        setDocs((prev) => [row, ...prev].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      }
    });
  }

  async function viewPdf(row: DealerDocRow) {
    setErr(null);
    if (!row.pdfStoragePath) {
      setErr('No PDF available for this document.');
      return;
    }
    const sb = createClient();
    const { data, error } = await sb.storage
      .from('quote-pdfs')
      .createSignedUrl(row.pdfStoragePath, 120);
    if (error || !data) {
      setErr(`Couldn't load PDF: ${error?.message ?? 'unknown'}`);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  function startConvert(target: 'invoice' | 'po', from: DealerDocRow) {
    if (from.kind !== 'quote') return;
    setConvertSource({ kind: target, from });
  }

  return (
    <>
      <section
        style={{
          marginTop: 24,
          background: '#fff',
          border: '1px solid var(--adm-line)',
          borderRadius: 8,
          padding: 20,
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ font: '600 18px/1 var(--f-body)', margin: 0 }}>
              Documents ({docs.length})
            </h2>
            <div style={{ fontSize: 13, color: 'var(--adm-ink-mute)', marginTop: 4 }}>
              Quotes, invoices, and purchase orders for this lead. Toggle visibility to control
              what the buyer sees in /portal.
            </div>
          </div>
        </header>

        {err && (
          <div style={{ background: '#fee', color: '#a00', padding: 10, borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
            {err}
          </div>
        )}

        {docs.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--adm-ink-mute)', background: 'var(--adm-bg)', borderRadius: 6, fontSize: 13 }}>
            No documents yet. Use the &ldquo;+ Quote&rdquo;, &ldquo;+ Invoice&rdquo;, or &ldquo;+ PO&rdquo; buttons up top.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {docs.map((row) => {
              const tint = KIND_BG[row.kind];
              return (
                <li
                  key={`${row.kind}-${row.id}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: '12px 14px',
                    background: 'var(--adm-bg)',
                    border: '1px solid var(--adm-line)',
                    borderRadius: 6,
                    opacity: row.visibleToBuyer ? 1 : 0.7,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 10,
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: 0.04,
                          background: tint.bg,
                          color: tint.color,
                        }}
                      >
                        {KIND_LABELS[row.kind]}
                      </span>
                      <span style={{ fontWeight: 500, fontSize: 14 }}>{row.title}</span>
                      {!row.visibleToBuyer && (
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 10,
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          background: '#fee',
                          color: '#a00',
                        }}>
                          Hidden from buyer
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--adm-ink-mute)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span>{new Date(row.createdAt).toLocaleDateString()}</span>
                      {row.secondaryDate && (
                        <span>{row.secondaryLabel}: {new Date(row.secondaryDate).toLocaleDateString()}</span>
                      )}
                      <span>{fmtCents(row.totalCents)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {row.kind === 'quote' && (
                      <>
                        <button
                          onClick={() => startConvert('invoice', row)}
                          title="Convert this quote into an invoice (pre-fills the same line items)"
                          style={btnSecondary}
                        >
                          → Invoice
                        </button>
                        <button
                          onClick={() => startConvert('po', row)}
                          title="Convert this quote into a purchase order"
                          style={btnSecondary}
                        >
                          → PO
                        </button>
                      </>
                    )}
                    <button onClick={() => viewPdf(row)} style={btnSecondary} title="Open PDF in a new tab">
                      PDF
                    </button>
                    <button
                      onClick={() => toggleVisible(row)}
                      style={row.visibleToBuyer ? btnVisible : btnHidden}
                      title={row.visibleToBuyer ? 'Visible to buyer — click to hide' : 'Hidden from buyer — click to show'}
                    >
                      {row.visibleToBuyer ? '👁 Visible' : '🚫 Hidden'}
                    </button>
                    <button onClick={() => onDelete(row)} style={btnDelete} title="Delete this document">
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {convertSource?.kind === 'invoice' && (
        <InvoiceFormModal
          leadId={leadId}
          orgId={orgId}
          homeId={convertSource.from.homeId}
          homeName={convertSource.from.homeName}
          defaultLineItems={convertSource.from.lineItems.length > 0 ? convertSource.from.lineItems : defaultLineItems}
          homes={homes}
          quoteId={convertSource.from.id}
          onClose={() => setConvertSource(null)}
          onCreated={() => setConvertSource(null)}
        />
      )}

      {convertSource?.kind === 'po' && (
        <PurchaseOrderFormModal
          leadId={leadId}
          orgId={orgId}
          homeId={convertSource.from.homeId}
          homeName={convertSource.from.homeName}
          defaultLineItems={convertSource.from.lineItems.length > 0 ? convertSource.from.lineItems : defaultLineItems}
          homes={homes}
          quoteId={convertSource.from.id}
          onClose={() => setConvertSource(null)}
          onCreated={() => setConvertSource(null)}
        />
      )}
    </>
  );
}

const btnSecondary: React.CSSProperties = {
  background: '#fff',
  color: 'var(--adm-ink)',
  border: '1px solid var(--adm-line)',
  padding: '6px 10px',
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const btnVisible: React.CSSProperties = {
  ...btnSecondary,
  background: '#ecf7ed',
  borderColor: '#b9deba',
  color: '#1d6f3f',
};

const btnHidden: React.CSSProperties = {
  ...btnSecondary,
  background: '#faf0ee',
  borderColor: '#e0c0bc',
  color: '#a53a2c',
};

const btnDelete: React.CSSProperties = {
  ...btnSecondary,
  color: '#a53a2c',
  borderColor: '#e0c0bc',
};
