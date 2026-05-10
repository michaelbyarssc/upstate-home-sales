import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import type { LeadStage } from '@uhs/db';

type SearchParams = { window?: string };

const WINDOWS: Array<{ key: '7' | '30' | '90' | '365' | 'all'; label: string; days: number | null }> = [
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: '365', label: 'Last 12 months', days: 365 },
  { key: 'all', label: 'All time', days: null },
];

type LeadRow = {
  id: string;
  stage: LeadStage;
  source: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  gclid: string | null;
  fbclid: string | null;
  referrer_url: string | null;
  created_at: string;
};

export default async function SourcesReportPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createClient();
  const winKey = (searchParams.window as typeof WINDOWS[number]['key'] | undefined) ?? '30';
  const win = WINDOWS.find((w) => w.key === winKey) ?? WINDOWS[1]!;

  let query = supabase
    .from('leads')
    .select('id, stage, source, utm_source, utm_medium, utm_campaign, gclid, fbclid, referrer_url, created_at')
    .order('created_at', { ascending: false })
    .limit(5000);

  if (win.days != null) {
    const since = new Date(Date.now() - win.days * 86_400_000).toISOString();
    query = query.gte('created_at', since);
  }

  const { data: leads } = await query;
  const rows = (leads ?? []) as LeadRow[];

  // Group by best-available attribution. Order of precedence:
  //   1. utm_source (paid/organic with explicit tagging)
  //   2. gclid → "google-cpc-untagged"
  //   3. fbclid → "facebook-untagged"
  //   4. referrer host → "referral"
  //   5. lead.source (form type fallback)
  const byKey = new Map<string, { label: string; total: number; quoted: number; won: number; lost: number; campaigns: Map<string, number> }>();

  for (const r of rows) {
    let key: string;
    let label: string;
    if (r.utm_source) {
      key = `utm:${r.utm_source.toLowerCase()}`;
      label = r.utm_source;
    } else if (r.gclid) {
      key = 'gclid';
      label = 'google-cpc (untagged)';
    } else if (r.fbclid) {
      key = 'fbclid';
      label = 'facebook (untagged)';
    } else if (r.referrer_url) {
      try {
        const host = new URL(r.referrer_url).hostname.replace(/^www\./, '');
        key = `ref:${host}`;
        label = host;
      } catch {
        key = 'referrer:unknown';
        label = 'referrer (unparseable)';
      }
    } else {
      key = `form:${r.source}`;
      label = `direct (${r.source.replace('_', ' ')})`;
    }

    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { label, total: 0, quoted: 0, won: 0, lost: 0, campaigns: new Map() };
      byKey.set(key, bucket);
    }
    bucket.total++;
    if (r.stage === 'quoted') bucket.quoted++;
    if (r.stage === 'won') bucket.won++;
    if (r.stage === 'lost') bucket.lost++;
    if (r.utm_campaign) {
      bucket.campaigns.set(r.utm_campaign, (bucket.campaigns.get(r.utm_campaign) ?? 0) + 1);
    }
  }

  const sorted = Array.from(byKey.values()).sort((a, b) => b.total - a.total);
  const grandTotal = rows.length;
  const grandWon = rows.filter((r) => r.stage === 'won').length;

  return (
    <>
      <div className="page-header">
        <div className="eyebrow">
          <Link href="/reports" style={{ color: 'inherit', textDecoration: 'none' }}>← Reports</Link>
        </div>
        <h1>Lead sources</h1>
        <p>
          {grandTotal.toLocaleString()} lead{grandTotal === 1 ? '' : 's'} · {grandWon} won
          {' · '}
          {grandTotal > 0 ? `${Math.round((grandWon / grandTotal) * 100)}% close rate` : '—'}
        </p>
      </div>

      <nav style={{ display: 'flex', gap: 8, marginTop: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {WINDOWS.map((w) => (
          <Link
            key={w.key}
            href={`/reports/sources?window=${w.key}`}
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

      {sorted.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--adm-ink-mute)', background: '#fff', border: '1px solid var(--adm-line)', borderRadius: 8 }}>
          No leads in this window. Tag your ads with{' '}
          <code style={{ background: 'var(--adm-bg)', padding: '2px 6px', borderRadius: 3, fontSize: 12 }}>?utm_source=google&utm_campaign=spring</code>{' '}
          to start tracking.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--adm-line)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--adm-bg)', textAlign: 'left' }}>
                <th style={th}>Source</th>
                <th style={{ ...th, textAlign: 'right' }}>Leads</th>
                <th style={{ ...th, textAlign: 'right' }}>Quoted</th>
                <th style={{ ...th, textAlign: 'right' }}>Won</th>
                <th style={{ ...th, textAlign: 'right' }}>Lost</th>
                <th style={{ ...th, textAlign: 'right' }}>Quote rate</th>
                <th style={{ ...th, textAlign: 'right' }}>Close rate</th>
                <th style={th}>Top campaigns</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => {
                const quoteRate = b.total > 0 ? Math.round(((b.quoted + b.won) / b.total) * 100) : 0;
                const closeRate = b.total > 0 ? Math.round((b.won / b.total) * 100) : 0;
                const topCampaigns = Array.from(b.campaigns.entries())
                  .sort((a, c) => c[1] - a[1])
                  .slice(0, 3)
                  .map(([n, c]) => `${n} (${c})`)
                  .join(', ');
                return (
                  <tr key={b.label} style={{ borderTop: '1px solid var(--adm-line)' }}>
                    <td style={td}><strong>{b.label}</strong></td>
                    <td style={tdRight}>{b.total}</td>
                    <td style={tdRight}>{b.quoted}</td>
                    <td style={{ ...tdRight, color: '#1d6f3f' }}>{b.won}</td>
                    <td style={{ ...tdRight, color: 'var(--adm-ink-mute)' }}>{b.lost}</td>
                    <td style={tdRight}>{quoteRate}%</td>
                    <td style={tdRight}><strong>{closeRate}%</strong></td>
                    <td style={{ ...td, color: 'var(--adm-ink-mute)', fontSize: 12 }}>{topCampaigns || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 16, fontSize: 12, color: 'var(--adm-ink-mute)' }}>
        Source labels prefer <code>utm_source</code>; falls back to gclid/fbclid presence, then referrer
        host, then form type. Tag every ad URL with <code>?utm_source=&amp;utm_medium=&amp;utm_campaign=</code>
        for accurate attribution.
      </p>
    </>
  );
}

const th: React.CSSProperties = { padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--adm-ink-mute)', textTransform: 'uppercase', letterSpacing: 0.4 };
const td: React.CSSProperties = { padding: '12px 16px' };
const tdRight: React.CSSProperties = { padding: '12px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
