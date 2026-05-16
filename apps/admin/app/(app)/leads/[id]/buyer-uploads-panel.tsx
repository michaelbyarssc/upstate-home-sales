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

type Props = {
  initialUploads: BuyerDocument[];
};

export function BuyerUploadsPanel({ initialUploads }: Props) {
  const [uploads] = useState(initialUploads);
  const [err, setErr] = useState<string | null>(null);

  async function viewDoc(d: BuyerDocument) {
    setErr(null);
    const sb = createClient();
    const { data, error } = await sb.storage
      .from(BUYER_DOCUMENTS_BUCKET)
      .createSignedUrl(d.storage_path, 120);
    if (error || !data) {
      setErr(`Couldn't load: ${error?.message ?? 'unknown'}`);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  return (
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
            Buyer uploads ({uploads.length})
          </h2>
          <div style={{ fontSize: 13, color: 'var(--adm-ink-mute)', marginTop: 4 }}>
            Documents the customer uploaded through the buyer portal for this inquiry.
          </div>
        </div>
      </header>

      {err && (
        <div style={{ background: '#fee', color: '#a00', padding: 10, borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
          {err}
        </div>
      )}

      {uploads.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--adm-ink-mute)', background: 'var(--adm-bg)', borderRadius: 6, fontSize: 13 }}>
          No uploads from the buyer yet. When they upload a doc in /portal and select this inquiry,
          it&rsquo;ll appear here.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
          {uploads.map((d) => (
            <li
              key={d.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 12,
                alignItems: 'center',
                padding: '10px 12px',
                background: 'var(--adm-bg)',
                border: '1px solid var(--adm-line)',
                borderRadius: 6,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 10,
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: 0.04,
                      background: '#fff',
                      color: 'var(--adm-ink)',
                      border: '1px solid var(--adm-line)',
                    }}
                  >
                    {KIND_LABELS[d.kind]}
                  </span>
                  <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.original_name}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--adm-ink-mute)' }}>
                  {(d.size_bytes / 1024).toFixed(0)} KB · uploaded {new Date(d.uploaded_at).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => viewDoc(d)}
                style={{
                  background: 'var(--adm-accent)',
                  color: '#fff',
                  border: 'none',
                  padding: '7px 12px',
                  borderRadius: 6,
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
    </section>
  );
}
