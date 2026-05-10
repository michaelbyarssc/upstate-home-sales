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

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.heic,.heif';

type Props = { initialDocs: BuyerDocument[]; userId: string };

export function DocumentsClient({ initialDocs, userId }: Props) {
  const [docs, setDocs] = useState(initialDocs);
  const [kind, setKind] = useState<BuyerDocKind>('driver_license');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!file) return setErr('Pick a file first.');
    if (file.size > MAX_BYTES) return setErr(`File too large (${(file.size / 1_048_576).toFixed(1)} MB). Max 10 MB.`);

    setUploading(true);
    const sb = createClient();

    // Upload to <user_id>/<timestamp>-<random>.<ext>
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

  async function viewDoc(d: BuyerDocument) {
    const sb = createClient();
    const { data, error } = await sb.storage
      .from(BUYER_DOCUMENTS_BUCKET)
      .createSignedUrl(d.storage_path, 60); // 60-second URL
    if (error || !data) {
      alert(`Couldn't load: ${error?.message ?? 'unknown'}`);
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

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {/* Upload card */}
      <div className="portal-card">
        <h2 style={{ font: '600 18px/1 var(--f-body)', marginBottom: 12 }}>Upload a document</h2>
        <form onSubmit={onUpload} style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: 10, alignItems: 'end' }}>
          <div className="field">
            <label className="label" htmlFor="doc-kind" style={{ display: 'block', font: '600 12px/1 var(--f-body)', textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 6 }}>Type</label>
            <select
              id="doc-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as BuyerDocKind)}
              style={{ padding: '9px 10px', border: '1px solid var(--c-line)', borderRadius: 'var(--r-1)', width: '100%', fontSize: 14 }}
            >
              {(Object.keys(KIND_LABELS) as BuyerDocKind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="doc-file" style={{ display: 'block', font: '600 12px/1 var(--f-body)', textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 6 }}>File</label>
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
            disabled={uploading || !file}
            style={{
              padding: '11px 18px', background: 'var(--c-accent)', color: '#fff',
              border: 'none', borderRadius: 'var(--r-1)', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', opacity: uploading || !file ? 0.6 : 1,
            }}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </form>
        {err && <div style={{ marginTop: 12, padding: 10, background: '#faf0ee', color: '#a53a2c', border: '1px solid #e0c0bc', borderRadius: 4, fontSize: 13 }}>{err}</div>}
        <p style={{ marginTop: 12, fontSize: 12, color: 'var(--c-ink-mute)' }}>
          PDF, PNG, JPG, or HEIC up to 10 MB. Files are private and encrypted; only you and your assigned salesperson can open them.
        </p>
      </div>

      {/* List card */}
      <div className="portal-card">
        <div className="portal-card-head">
          <div>
            <h2>Your documents ({docs.length})</h2>
            <div className="sub">Click to preview. Files older than 1 year are auto-deleted.</div>
          </div>
        </div>

        {docs.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-ink-mute)', background: 'var(--c-bg)', borderRadius: 'var(--r-1)' }}>
            No documents yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--c-line)', background: 'var(--c-bg)' }}>
                <th style={th}>Type</th>
                <th style={th}>Filename</th>
                <th style={{ ...th, textAlign: 'right' }}>Size</th>
                <th style={th}>Uploaded</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--c-line)' }}>
                  <td style={td}>
                    <span style={{
                      padding: '3px 9px', borderRadius: 10, fontSize: 11,
                      background: 'var(--c-bg)', color: 'var(--c-ink)', fontWeight: 500,
                    }}>{KIND_LABELS[d.kind]}</span>
                  </td>
                  <td style={td}>{d.original_name}</td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {(d.size_bytes / 1024).toFixed(0)} KB
                  </td>
                  <td style={{ ...td, color: 'var(--c-ink-mute)' }}>
                    {new Date(d.uploaded_at).toLocaleDateString()}
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => viewDoc(d)} style={btn}>Preview</button>
                    <button onClick={() => deleteDoc(d)} style={{ ...btn, color: '#a53a2c', marginLeft: 4 }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', font: '600 11px/1 var(--f-body)', textTransform: 'uppercase', letterSpacing: 0.04, color: 'var(--c-ink-mute)' };
const td: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' };
const btn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-accent)', fontSize: 13, padding: '4px 8px' };
