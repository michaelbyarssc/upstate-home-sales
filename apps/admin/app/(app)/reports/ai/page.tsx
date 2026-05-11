import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE } from '@uhs/db';

type SearchParams = { window?: string };

const WINDOWS: Array<{ key: '7' | '30' | '90' | '365'; label: string; days: number }> = [
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: '365', label: 'Last 12 months', days: 365 },
];

type SessionRow = {
  id: string;
  lead_captured: boolean;
  message_count: number;
  tokens_used: number;
  started_at: string;
};
type QueryRow = {
  query_text: string;
  result_count: number;
  clicked_home_id: string | null;
  occurred_at: string;
};

export const dynamic = 'force-dynamic';

export default async function AiReportPage({ searchParams }: { searchParams: SearchParams }) {
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
  if (!orgId) {
    return (
      <div className="placeholder">
        <strong>No active org.</strong> <Link href="/select-org">Pick one</Link>.
      </div>
    );
  }

  const winKey = (searchParams.window as typeof WINDOWS[number]['key'] | undefined) ?? '30';
  const win = WINDOWS.find((w) => w.key === winKey) ?? WINDOWS[1]!;
  const since = new Date(Date.now() - win.days * 86_400_000).toISOString();

  const sb = createClient();
  const [{ data: sessions }, { data: queries }] = await Promise.all([
    sb.from('chat_sessions')
      .select('id, lead_captured, message_count, tokens_used, started_at')
      .eq('org_id', orgId)
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(5000),
    sb.from('nl_search_queries')
      .select('query_text, result_count, clicked_home_id, occurred_at')
      .eq('org_id', orgId)
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(2000),
  ]);

  const sRows = (sessions ?? []) as SessionRow[];
  const qRows = (queries ?? []) as QueryRow[];

  // Chat aggregations.
  const totalSessions = sRows.length;
  const totalMessages = sRows.reduce((acc, r) => acc + (r.message_count ?? 0), 0);
  const totalTokens = sRows.reduce((acc, r) => acc + (r.tokens_used ?? 0), 0);
  const leadsCaptured = sRows.filter((r) => r.lead_captured).length;
  const leadCaptureRate = totalSessions > 0 ? Math.round((leadsCaptured / totalSessions) * 100) : 0;

  // Rough cost estimate. Defaults to a USD/1M-token rate for the default
  // chatbot model; dealer can override via AI_COST_USD_PER_M_TOKENS at deploy.
  const costPerMillion = Number(process.env.AI_COST_USD_PER_M_TOKENS) || 3;
  const estimatedCostUsd = (totalTokens / 1_000_000) * costPerMillion;

  // NL search aggregations.
  const totalQueries = qRows.length;
  const queriesWithClick = qRows.filter((r) => r.clicked_home_id !== null).length;
  const clickRate = totalQueries > 0 ? Math.round((queriesWithClick / totalQueries) * 100) : 0;
  const emptyQueries = qRows.filter((r) => r.result_count === 0).length;

  // Top queries by frequency.
  const queryCounts = new Map<string, number>();
  for (const q of qRows) {
    const key = q.query_text.trim().toLowerCase().slice(0, 80);
    queryCounts.set(key, (queryCounts.get(key) ?? 0) + 1);
  }
  const topQueries = Array.from(queryCounts.entries())
    .filter(([t]) => t.length > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Daily session timeseries for sparkline.
  const sessionByDay = new Map<string, number>();
  for (const s of sRows) {
    const day = s.started_at.slice(0, 10);
    sessionByDay.set(day, (sessionByDay.get(day) ?? 0) + 1);
  }
  const days: Array<{ day: string; count: number }> = [];
  for (let i = win.days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    days.push({ day: d, count: sessionByDay.get(d) ?? 0 });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  return (
    <>
      <div className="page-header">
        <div className="eyebrow">
          <Link href="/reports" style={{ color: 'inherit', textDecoration: 'none' }}>← Reports</Link>
        </div>
        <h1>AI activity</h1>
        <p>Chatbot conversations + natural-language inventory searches across the public site.</p>
      </div>

      <nav style={{ display: 'flex', gap: 8, marginTop: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {WINDOWS.map((w) => (
          <Link
            key={w.key}
            href={`/reports/ai?window=${w.key}`}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--adm-line)',
              background: w.key === winKey ? 'var(--adm-ink)' : '#fff',
              color: w.key === winKey ? '#fff' : 'var(--adm-ink)',
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            {w.label}
          </Link>
        ))}
      </nav>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <KpiCard label="Chat sessions" value={totalSessions.toLocaleString()} />
        <KpiCard label="Messages" value={totalMessages.toLocaleString()} />
        <KpiCard label="Tokens used" value={totalTokens.toLocaleString()} sub={`~$${estimatedCostUsd.toFixed(2)} est.`} />
        <KpiCard
          label="Leads captured"
          value={leadsCaptured.toLocaleString()}
          sub={`${leadCaptureRate}% of sessions`}
          accent={leadsCaptured > 0}
        />
        <KpiCard label="Smart searches" value={totalQueries.toLocaleString()} />
        <KpiCard
          label="Search→click"
          value={`${clickRate}%`}
          sub={`${queriesWithClick}/${totalQueries}`}
        />
        <KpiCard
          label="Empty results"
          value={emptyQueries.toLocaleString()}
          sub={emptyQueries > 0 ? 'Inventory gaps to close' : 'No misses'}
          accent={emptyQueries === 0}
        />
      </div>

      <section style={{ marginTop: 32 }}>
        <h3 style={{ marginBottom: 12 }}>Sessions per day</h3>
        <div style={{ background: '#fff', border: '1px solid var(--adm-line)', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
            {days.map((d) => (
              <div
                key={d.day}
                title={`${d.day}: ${d.count} session${d.count === 1 ? '' : 's'}`}
                style={{
                  flex: 1,
                  height: `${Math.max(1, (d.count / maxDay) * 100)}%`,
                  background: d.count > 0 ? 'var(--adm-accent)' : 'var(--adm-line)',
                  borderRadius: 2,
                  minHeight: 1,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--adm-ink-mute)', marginTop: 6 }}>
            <span>{days[0]?.day}</span>
            <span>{days[days.length - 1]?.day}</span>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h3 style={{ marginBottom: 12 }}>Top natural-language searches</h3>
        {topQueries.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--adm-ink-mute)',
              background: '#fff',
              border: '1px solid var(--adm-line)',
              borderRadius: 8,
            }}
          >
            No NL searches yet in this window. The smart-search bar on /inventory fires queries here as buyers use it.
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid var(--adm-line)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--adm-bg)', textAlign: 'left' }}>
                  <th style={th}>Query</th>
                  <th style={{ ...th, textAlign: 'right' }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {topQueries.map(([q, n]) => (
                  <tr key={q} style={{ borderTop: '1px solid var(--adm-line)' }}>
                    <td style={td}><code>{q}</code></td>
                    <td style={tdRight}>{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p style={{ marginTop: 16, fontSize: 12, color: 'var(--adm-ink-mute)' }}>
        Cost estimate uses{' '}
        <code>AI_COST_USD_PER_M_TOKENS</code>{' '}
        env (defaults to $3/M tokens, the Sonnet 4.6 blended rate). Set it to match your AI Gateway billing if you&rsquo;re on a different model.
      </p>
    </>
  );
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div
      style={{
        padding: 16,
        background: '#fff',
        border: '1px solid var(--adm-line)',
        borderRadius: 8,
        borderTop: accent ? '3px solid var(--adm-accent)' : '1px solid var(--adm-line)',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--adm-ink-mute)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--adm-ink-mute)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--adm-ink-mute)',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};
const td: React.CSSProperties = { padding: '12px 16px' };
const tdRight: React.CSSProperties = { padding: '12px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
