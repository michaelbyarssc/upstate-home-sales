import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type VisitorEventKind } from '@uhs/db';

type SearchParams = { window?: string };

const WINDOWS: Array<{ key: '7' | '30' | '90' | '365'; label: string; days: number }> = [
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: '365', label: 'Last 12 months', days: 365 },
];

type VisitorRow = {
  ip_city: string | null;
  ip_region: string | null;
  ip_country: string | null;
  event_type: VisitorEventKind;
  session_id: string;
};

type Bucket = {
  city: string;
  region: string;
  country: string;
  total: number;
  sessions: Set<string>;
  homeViews: number;
  leadSubmits: number;
};

export const dynamic = 'force-dynamic';

export default async function VisitorsReportPage({ searchParams }: { searchParams: SearchParams }) {
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
  const { data: events } = await sb
    .from('visitor_events')
    .select('ip_city, ip_region, ip_country, event_type, session_id')
    .eq('org_id', orgId)
    .gte('occurred_at', since)
    .limit(50000);
  const rows = (events ?? []) as VisitorRow[];

  // Group by city + region. Unknown city collapses to "—" but keeps region/country.
  const byKey = new Map<string, Bucket>();
  let totalEvents = 0;
  const allSessions = new Set<string>();

  for (const r of rows) {
    totalEvents++;
    allSessions.add(r.session_id);
    const city = r.ip_city?.trim() || '—';
    const region = r.ip_region?.trim() || '';
    const country = r.ip_country?.trim() || '';
    const key = `${country}|${region}|${city}`;
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { city, region, country, total: 0, sessions: new Set(), homeViews: 0, leadSubmits: 0 };
      byKey.set(key, bucket);
    }
    bucket.total++;
    bucket.sessions.add(r.session_id);
    if (r.event_type === 'home_view') bucket.homeViews++;
    if (r.event_type === 'lead_submitted') bucket.leadSubmits++;
  }

  const sorted = Array.from(byKey.values())
    .sort((a, b) => b.sessions.size - a.sessions.size)
    .slice(0, 50);

  return (
    <>
      <div className="page-header">
        <div className="eyebrow">
          <Link href="/reports" style={{ color: 'inherit', textDecoration: 'none' }}>← Reports</Link>
        </div>
        <h1>Visitor geography</h1>
        <p>
          {totalEvents.toLocaleString()} event{totalEvents === 1 ? '' : 's'} from{' '}
          {allSessions.size.toLocaleString()} session{allSessions.size === 1 ? '' : 's'} in{' '}
          {sorted.length} cit{sorted.length === 1 ? 'y' : 'ies'}
        </p>
      </div>

      <nav style={{ display: 'flex', gap: 8, marginTop: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {WINDOWS.map((w) => (
          <Link
            key={w.key}
            href={`/reports/visitors?window=${w.key}`}
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
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--adm-ink-mute)',
            background: '#fff',
            border: '1px solid var(--adm-line)',
            borderRadius: 8,
          }}
        >
          No visitor events in this window. Public-site page views land here as soon as the public app is deployed
          with Vercel IP-geo headers enabled (they are, by default).
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--adm-line)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--adm-bg)', textAlign: 'left' }}>
                <th style={th}>City</th>
                <th style={th}>Region</th>
                <th style={th}>Country</th>
                <th style={{ ...th, textAlign: 'right' }}>Sessions</th>
                <th style={{ ...th, textAlign: 'right' }}>Events</th>
                <th style={{ ...th, textAlign: 'right' }}>Home views</th>
                <th style={{ ...th, textAlign: 'right' }}>Lead submits</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => (
                <tr key={`${b.country}|${b.region}|${b.city}`} style={{ borderTop: '1px solid var(--adm-line)' }}>
                  <td style={td}><strong>{b.city}</strong></td>
                  <td style={td}>{b.region || '—'}</td>
                  <td style={td}>{b.country || '—'}</td>
                  <td style={tdRight}>{b.sessions.size}</td>
                  <td style={tdRight}>{b.total}</td>
                  <td style={tdRight}>{b.homeViews}</td>
                  <td style={{ ...tdRight, color: b.leadSubmits > 0 ? '#1d6f3f' : 'var(--adm-ink-mute)' }}>
                    {b.leadSubmits}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 16, fontSize: 12, color: 'var(--adm-ink-mute)' }}>
        Geo data is coarse — derived from Vercel&rsquo;s IP-headers
        (<code>x-vercel-ip-city</code>, <code>x-vercel-ip-country-region</code>, <code>x-vercel-ip-country</code>).
        Top 50 cities by unique session count. Map visualization lands in a follow-up.
      </p>
    </>
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
