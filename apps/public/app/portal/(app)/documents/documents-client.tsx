'use client';

import { useState } from 'react';
import { createClient } from '@uhs/db/browser';
import { BUYER_DOCUMENTS_BUCKET, type BuyerDocKind, type BuyerDocument } from '@uhs/db';

const KIND_LABELS: Record<BuyerDocKind, string> = {
  driver_license: "Driver's license",
  w2: 'W2',
  proof_of_income: 'Proof of income',
  bank_statement: 'Bank statement',
  other: 'Other',
};

const DEALER_DOC_LABELS: Record<DealerDoc['kind'], string> = {
  quote: 'Quote',
  invoice: 'Invoice',
  po: 'Purchase Order',
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.heic,.heif';
const QUOTE_PDFS_BUCKET = 'quote-pdfs';

export type LinkedLeadOption = {
  leadId: string;
  orgId: string;
  label: string;
  stockNo: string | null;
};

export type DealerDoc = {
  kind: 'quote' | 'invoice' | 'po';
  id: string;
  leadId: string;
  leadLabel: string;
  homeName: string | null;
  title: string;
  publicToken: string;
  publicHref: string;
  pdfStoragePath: string | null;
  totalCents: number | null;
  createdAt: string;
  secondaryDate: string | null;
  secondaryLabel: string;
};

type Props = {
  initialDocs: BuyerDocument[];
  userId: string;
  linkedLeads: LinkedLeadOption[];
  dealerDocs: DealerDoc[];
};

function fmtCents(cents: number | null): string {
  if (cents == null) return '—';
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function DocumentsClient({ initialDocs, userId, linkedLeads, dealerDocs }: Props) {
  const [docs, setDocs] = useState(initialDocs);
  const [kind, setKind] = useState<BuyerDocKind>('driver_license');
  const [file, setFile] = useState<File | null>(null);
  const [uploadLeadId, setUploadLeadId] = useState<string>(linkedLeads[0]?.leadId ?? '');
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!file) return setErr('Pick a file first.');
    if (file.size > MAX_BYTES) return setErr(`File too large (${(file.size / 1_048_576).toFixed(1)} MB). Max 10 MB.`);

    // Map the chosen lead to its org so admin RLS sees the doc.
    const linked = linkedLeads.find((l) => l.leadId === uploadLeadId);
    const leadIdToSet = linked?.leadId ?? null;
    const orgIdToSet = linked?.orgId ?? null;

    setUploading(true);
    const sb = createClient();

    const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().slice(0, 8);
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `${userId}/${safeName}`;

    const { error: upErr } = await sb.storage
      .from(BUYER_DOCUMENTS_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (upErr) {
      setUploading(false);
      setErr(`Upload failed: ${upErr.message}`);
      return;
    }

    const { data: row, error: rowErr } = await sb
      .from('buyer_documents')
      .insert({
        buyer_id: userId,
        lead_id: leadIdToSet,
        org_id: orgIdToSet,
        kind,
        storage_path: storagePath,
        original_name: file.name,
        size_bytes: file.size,
        content_type: file.type || 'application/octet-stream',
      })
      .select('*')
      .single();

    setUploading(false);
    if (rowErr || !row) {
      setErr(`Saved file but couldn't record it: ${rowErr?.message ?? 'unknown'}`);
      return;
    }
    setDocs((prev) => [row as BuyerDocument, ...prev]);
    setFile(null);
    (document.getElementById('doc-file') as HTMLInputElement).value = '';
  }

  async function viewMyDoc(d: BuyerDocument) {
    const sb = createClient();
    const { data, error } = await sb.storage
      .from(BUYER_DOCUMENTS_BUCKET)
      .createSignedUrl(d.storage_path, 60);
    if (error || !data) {
      alert(`Couldn't load: ${error?.message ?? 'unknown'}`);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function viewDealerDoc(d: DealerDoc) {
    // Prefer the public token URL (works even without storage RLS).
    if (d.publicHref) {
      window.open(d.publicHref, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!d.pdfStoragePath) {
      alert('No PDF available yet for this document.');
      return;
    }
    const sb = createClient();
    const { data, error } = await sb.storage
      .from(QUOTE_PDFS_BUCKET)
      .createSignedUrl(d.pdfStoragePath, 60);
    if (error || !data) {
      alert(`Couldn't load PDF: ${error?.message ?? 'unknown'}`);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function deleteDoc(d: BuyerDocument) {
    if (!confirm(`Delete "${d.original_name}"? This can't be undone.`)) return;
    const sb = createClient();
    const { error: stErr } = await sb.storage.from(BUYER_DOCUMENTS_BUCKET).remove([d.storage_path]);
    if (stErr) {
      alert(`Storage delete failed: ${stErr.message}`);
      return;
    }
    const { error: rowErr } = await sb.from('buyer_documents').delete().eq('id', d.id);
    if (rowErr) {
      alert(`Record delete failed: ${rowErr.message}`);
      return;
    }
    setDocs((prev) => prev.filter((x) => x.id !== d.id));
  }

  const noLinkedLeads = linkedLeads.length === 0;

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {/* ─── From your dealer ────────────────────────────────────── */}
      <div className="portal-card">
        <div className="portal-card-head">
          <div>
            <h2>From your dealer ({dealerDocs.length})</h2>
            <div className="sub">Quotes, invoices, and purchase orders.</div>
          </div>
        </div>

        {dealerDocs.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--c-ink-mute)', background: 'var(--c-bg)', borderRadius: 'var(--r-1)' }}>
            Nothing here yet. Anything your dealer creates for you will show up automatically.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {dealerDocs.map((d) => (
              <li
                key={`${d.kind}-${d.id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 12,
                  alignItems: 'center',
                  padding: '12px 14px',
                  background: 'var(--c-bg)',
                  border: '1px solid var(--c-line)',
                  borderRadius: 'var(--r-1)',
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
                        background: d.kind === 'quote' ? '#dbeafe' : d.kind === 'invoice' ? '#fef3c7' : '#dcfce7',
                        color: d.kind === 'quote' ? '#1e40af' : d.kind === 'invoice' ? '#854d0e' : '#166534',
                      }}
                    >
                      {DEALER_DOC_LABELS[d.kind]}
                    </span>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{d.title}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--c-ink-mute)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                    {d.secondaryDate && (
                      <span>
                        {d.secondaryLabel}: {new Date(d.secondaryDate).toLocaleDateString()}
                      </span>
                    )}
                    {d.totalCents != null && <span>{fmtCents(d.totalCents)}</span>}
                  </div>
                </div>
                <button
                  onClick={() => viewDealerDoc(d)}
                  style={{
                    background: 'var(--c-accent)',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: 'var(--r-1)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ─── Upload card ─────────────────────────────────────────── */}
      <div className="portal-card">
        <h2 style={{ font: '600 18px/1 var(--f-body)', marginBottom: 12 }}>Upload a document</h2>

        {noLinkedLeads ? (
          <div
            style={{
              padding: 16,
              background: 'var(--c-bg)',
              borderRadius: 'var(--r-1)',
              fontSize: 13,
              color: 'var(--c-ink-mute)',
            }}
          >
            Once your dealer links an inquiry to your portal, you can upload documents here and
            they&rsquo;ll see them on that inquiry. Ask your salesperson if this is missing.
          </div>
        ) : (
          <form onSubmit={onUpload} style={{ display: 'grid', gap: 10 }}>
            {linkedLeads.length > 1 && (
              <div className="field">
                <label htmlFor="doc-lead" style={{ display: 'block', font: '600 12px/1 var(--f-body)', textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 6 }}>
                  For which inquiry?
                </label>
                <select
                  id="doc-lead"
                  value={uploadLeadId}
                  onChange={(e) => setUploadLeadId(e.target.value)}
                  style={{ padding: '9px 10px', border: '1px solid var(--c-line)', borderRadius: 'var(--r-1)', width: '100%', fontSize: 14 }}
                >
                  {linkedLeads.map((l) => (
                    <option key={l.leadId} value={l.leadId}>
                      {l.label}
                      {l.stockNo ? ` (${l.stockNo})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 200px) 1fr auto', gap: 10, alignItems: 'end' }}>
              <div className="field">
                <label htmlFor="doc-kind" style={{ display: 'block', font: '600 12px/1 var(--f-body)', textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 6 }}>
                  Type
                </label>
                <select
                  id="doc-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as BuyerDocKind)}
                  style={{ padding: '9px 10px', border: '1px solid var(--c-line)', borderRadius: 'var(--r-1)', width: '100%', fontSize: 14 }}
                >
                  {(Object.keys(KIND_LABELS) as BuyerDocKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="doc-file" style={{ display: 'block', font: '600 12px/1 var(--f-body)', textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 6 }}>
                  File
                </label>
                <input
                  id="doc-file"
                  type="file"
                  accept={ACCEPTED}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  style={{ padding: 8, border: '1px solid var(--c-line)', borderRadius: 'var(--r-1)', width: '100%', fontSize: 14 }}
                />
              </div>

              <button
                type="submit"
                disabled={uploading || !file || !uploadLeadId}
                style={{
                  padding: '11px 18px',
                  background: 'var(--c-accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--r-1)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: uploading || !file || !uploadLeadId ? 0.6 : 1,
                  minHeight: 44,
                }}
              >
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>

            {linkedLeads.length === 1 && linkedLeads[0] && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--c-ink-mute)' }}>
                Uploading for: <strong>{linkedLeads[0].label}</strong>. Your salesperson will see this on that inquiry.
              </p>
            )}
          </form>
        )}

        {err && (
          <div style={{ marginTop: 12, padding: 10, background: '#faf0ee', color: '#a53a2c', border: '1px solid #e0c0bc', borderRadius: 4, fontSize: 13 }}>
            {err}
          </div>
        )}

        <p style={{ marginTop: 12, fontSize: 12, color: 'var(--c-ink-mute)' }}>
          PDF, PNG, JPG, or HEIC up to 10 MB. Files are private; only you and the salesperson on
          the chosen inquiry can open them.
        </p>
      </div>

      {/* ─── Your uploads ────────────────────────────────────────── */}
      <div className="portal-card">
        <div className="portal-card-head">
          <div>
            <h2>Your uploads ({docs.length})</h2>
            <div className="sub">Click to preview. Files older than 1 year are auto-deleted.</div>
          </div>
        </div>

        {docs.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-ink-mute)', background: 'var(--c-bg)', borderRadius: 'var(--r-1)' }}>
            No documents yet.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            {docs.map((d) => (
              <li
                key={d.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 12,
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: 'var(--c-bg)',
                  border: '1px solid var(--c-line)',
                  borderRadius: 'var(--r-1)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: 11,
                        background: '#fff',
                        color: 'var(--c-ink)',
                        fontWeight: 500,
                        border: '1px solid var(--c-line)',
                      }}
                    >
                      {KIND_LABELS[d.kind]}
                    </span>
                    <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.original_name}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--c-ink-mute)' }}>
                    {(d.size_bytes / 1024).toFixed(0)} KB · uploaded {new Date(d.uploaded_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => viewMyDoc(d)}
                    style={{
                      background: 'none',
                      border: '1px solid var(--c-line)',
                      cursor: 'pointer',
                      color: 'var(--c-ink)',
                      fontSize: 13,
                      padding: '6px 10px',
                      borderRadius: 'var(--r-1)',
                    }}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => deleteDoc(d)}
                    style={{
                      background: 'none',
                      border: '1px solid var(--c-line)',
                      cursor: 'pointer',
                      color: '#a53a2c',
                      fontSize: 13,
                      padding: '6px 10px',
                      borderRadius: 'var(--r-1)',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
