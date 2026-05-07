import Link from 'next/link';
import { createClient } from '@uhs/db/server';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const supabase = createClient();
  const { data: events } = await supabase
    .from('audit_events')
    .select('id, kind, subject_table, subject_id, before, after, created_at, actor_id')
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = events ?? [];

  return (
    <>
      <div className="page-header">
        <div className="eyebrow">Workspace · Audit</div>
        <h1>Audit log</h1>
        <p>Last {rows.length} events. Owner/manager only. Append-only — purged after 7 years.</p>
      </div>

      {rows.length === 0 ? (
        <div className="placeholder">
          <strong>No audit events.</strong> Appears as you edit pricing, status, leads, etc.
        </div>
      ) : (
        <table style={{
          width: '100%', background: '#fff', borderCollapse: 'collapse',
          border: '1px solid var(--adm-line)', borderRadius: 8, overflow: 'hidden',
          fontSize: 13,
        }}>
          <thead>
            <tr style={{ background: 'var(--c-bg)' }}>
              <th style={th}>When</th>
              <th style={th}>Event</th>
              <th style={th}>Subject</th>
              <th style={th}>Actor</th>
              <th style={th}>Diff</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td style={td}>{new Date(e.created_at).toLocaleString()}</td>
                <td style={td}><code>{e.kind}</code></td>
                <td style={td}>
                  <code>{e.subject_table}</code>
                  <div style={{ fontSize: 11, color: 'var(--adm-ink-mute)', marginTop: 2 }}>
                    {linkSubject(e.subject_table, e.subject_id)}
                  </div>
                </td>
                <td style={td}><code style={{ fontSize: 11 }}>{e.actor_id?.slice(0, 8) ?? '—'}…</code></td>
                <td style={td}>
                  <details style={{ cursor: 'pointer' }}>
                    <summary style={{ color: 'var(--adm-accent)', fontSize: 12 }}>View</summary>
                    <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11 }}>
                      {e.before && (
                        <pre style={pre}><strong style={{ color: '#a53a2c' }}>before</strong>{'\n'}{JSON.stringify(e.before, null, 2)}</pre>
                      )}
                      {e.after && (
                        <pre style={pre}><strong style={{ color: '#4a6b3f' }}>after</strong>{'\n'}{JSON.stringify(e.after, null, 2)}</pre>
                      )}
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function linkSubject(table: string, id: string) {
  if (table === 'homes') return <Link href={`/inventory/${id}`}>{id.slice(0, 8)}…</Link>;
  if (table === 'leads') return <Link href={`/leads/${id}`}>{id.slice(0, 8)}…</Link>;
  return <span>{id.slice(0, 8)}…</span>;
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 14px',
  font: '600 11px/1 var(--f-body)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--adm-ink-mute)',
  borderBottom: '1px solid var(--adm-line)',
};
const td: React.CSSProperties = { padding: '10px 14px', borderBottom: '1px solid #efeae0', verticalAlign: 'top' };
const pre: React.CSSProperties = {
  background: 'var(--c-bg)', padding: 8, borderRadius: 4, margin: 0,
  fontFamily: 'var(--f-mono)', fontSize: 11, lineHeight: 1.4,
  maxWidth: 320, overflow: 'auto',
};
