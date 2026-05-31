'use client';

import { useState, useTransition } from 'react';
import { generateAndStartSigning } from '../../documents/generate-actions';

type TemplateOpt = { id: string; name: string };
type InstanceRow = {
  id: string;
  doc_number: number | null;
  status: string;
  created_at: string;
  session_token: string | null;
};

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  draft: { bg: '#eee', fg: '#777' },
  sent: { bg: '#fdf3e0', fg: '#9a6a1a' },
  partially_signed: { bg: '#e7f0fb', fg: '#2b5f9e' },
  completed: { bg: '#e6f4ea', fg: '#1d6f3f' },
  voided: { bg: '#faecea', fg: '#a53a2c' },
  declined: { bg: '#faecea', fg: '#a53a2c' },
};

export function LeadSignDocsPanel({
  leadId,
  templates,
  instances,
  publicBaseUrl,
}: {
  leadId: string;
  templates: TemplateOpt[];
  instances: InstanceRow[];
  publicBaseUrl: string;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [justGenerated, setJustGenerated] = useState<string | null>(null);

  function generate() {
    setErr(null);
    setJustGenerated(null);
    if (!templateId) {
      setErr('Pick a template.');
      return;
    }
    startTransition(async () => {
      const res = await generateAndStartSigning({ leadId, templateId });
      if (!res.ok) setErr(res.error);
      else setJustGenerated(res.sessionToken);
    });
  }

  return (
    <section className="card" style={{ padding: 20, marginTop: 16 }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>Sign-ready documents</h3>
      <p style={{ fontSize: 13, color: 'var(--adm-ink-mute)', marginBottom: 14 }}>
        Generate a document from a template (price + details auto-filled and snapshotted), then sign
        in person on a tablet.
      </p>

      {templates.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--adm-ink-mute)' }}>
          No active templates. Register one under Documents first.
        </p>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="select"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            style={{ minWidth: 240 }}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn-primary" onClick={generate} disabled={pending}>
            {pending ? 'Generating…' : 'Generate & sign'}
          </button>
        </div>
      )}

      {err && <div style={{ color: '#a53a2c', fontSize: 13, marginTop: 10 }}>{err}</div>}

      {justGenerated && (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            background: '#e6f4ea',
            border: '1px solid #b9deba',
            borderRadius: 8,
          }}
        >
          <strong style={{ color: '#1d6f3f' }}>Document ready to sign.</strong>
          <div style={{ marginTop: 8 }}>
            <a
              href={`${publicBaseUrl}/sign/${justGenerated}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
              style={{ textDecoration: 'none' }}
            >
              Open signing on this device →
            </a>
          </div>
          <div style={{ fontSize: 12, color: 'var(--adm-ink-mute)', marginTop: 8 }}>
            Or open this link on the tablet: <code>{`${publicBaseUrl}/sign/${justGenerated}`}</code>
          </div>
        </div>
      )}

      {instances.length > 0 && (
        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          {instances.map((d) => {
            const c = STATUS_COLOR[d.status] ?? { bg: '#eee', fg: '#777' };
            return (
              <div
                key={d.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  border: '1px solid var(--adm-line)',
                  borderRadius: 8,
                }}
              >
                <div style={{ fontSize: 14 }}>
                  Document #{d.doc_number ?? '—'}
                  <span style={{ fontSize: 12, color: 'var(--adm-ink-mute)', marginLeft: 8 }}>
                    {new Date(d.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {d.status !== 'completed' && d.session_token && (
                    <a
                      href={`${publicBaseUrl}/sign/${d.session_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 13, color: 'var(--adm-accent)' }}
                    >
                      Resume signing →
                    </a>
                  )}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      padding: '3px 8px',
                      borderRadius: 999,
                      background: c.bg,
                      color: c.fg,
                    }}
                  >
                    {d.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
