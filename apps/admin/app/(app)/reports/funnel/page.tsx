import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE } from '@uhs/db';

export const dynamic = 'force-dynamic';

const STAGES: Array<{ event: string; label: string; description: string }> = [
  { event: 'page_view', label: 'Page views', description: 'Anyone landing on the public site' },
  { event: 'inventory_view', label: 'Inventory browses', description: 'Visited /inventory or filtered the list' },
  { event: 'home_view', label: 'Home detail views', description: 'Looked at a specific home' },
  { event: 'lead_submitted', label: 'Leads submitted', description: 'Filled the quote / contact form' },
  { event: 'quote_viewed', label: 'Quotes viewed', description: 'Buyer opened the share link' },
  { event: 'quote_signed', label: 'Quotes signed', description: 'E-sig captured' },
];

export default async function FunnelPage() {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
  if (!orgId) return <div className="placeholder"><strong>No active org.</strong> <Link href="/select-org">Pick one</Link>.</div>;

  // 30-day funnel.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const counts: Record<string, number> = {};
  for (const stage of STAGES) {
    const { count } = await supabase
      .from('visitor_events')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('event_type', stage.event)
      .gte('occurred_at', since);
    counts[stage.event] = count ?? 0;
  }
  const top = counts[STAGES[0]!.event] ?? 0;

  return (
    <>
      <div className="page-header">
        <div className="eyebrow">Last 30 days</div>
        <h1>Conversion funnel</h1>
        <p>How visitors flow through the public site to a signed quote.</p>
      </div>
      <section className="card" style={{ maxWidth: 720 }}>
        <div className="card-body">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {STAGES.map((s) => {
              const n = counts[s.event] ?? 0;
              const pct = top > 0 ? Math.round((n / top) * 100) : 0;
              return (
                <li key={s.event} style={{ background: '#FAF4EB', padding: '12px 16px', borderRadius: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{s.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--adm-ink-mute)' }}>{s.description}</div>
                    </div>
                    <div style={{ fontFamily: 'var(--f-display)', fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>
                      {n.toLocaleString()}
                    </div>
                  </div>
                  <div style={{
                    marginTop: 8,
                    height: 6,
                    background: '#fff',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: 'var(--adm-accent)',
                      transition: 'width 200ms ease',
                    }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </>
  );
}
