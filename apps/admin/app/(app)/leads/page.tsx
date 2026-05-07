import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import type { LeadStage } from '@uhs/db';
import { LeadsRealtime } from './leads-realtime';
import './leads.css';

type SearchParams = { stage?: string; q?: string };

const TABS: Array<{ key: 'open' | LeadStage; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'new', label: 'New' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'quoted', label: 'Quoted' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createClient();
  const stage = (searchParams.stage as LeadStage | 'open' | undefined) ?? 'open';

  // Lazy maintenance: flag any 'quoted' lead untouched for 48h+ as hot. Cheap
  // update; runs once per inbox load. RLS already scopes to the active org.
  const stale = new Date(Date.now() - 48 * 3600_000).toISOString();
  await supabase
    .from('leads')
    .update({ is_hot: true })
    .eq('stage', 'quoted')
    .eq('is_hot', false)
    .lt('updated_at', stale);

  let query = supabase
    .from('leads')
    .select('id, contact_name, email, phone, stage, source, is_hot, assignee_id, home_id, created_at, homes(name, stock_no)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (stage === 'open') query = query.in('stage', ['new', 'in_progress', 'quoted'] as LeadStage[]);
  else query = query.eq('stage', stage);

  const [{ data: rows }, { data: counts }] = await Promise.all([
    query,
    supabase.from('leads').select('stage'),
  ]);

  const tally: Record<string, number> = {};
  (counts ?? []).forEach((r: { stage: LeadStage }) => {
    tally[r.stage] = (tally[r.stage] ?? 0) + 1;
  });
  tally.open = (tally.new ?? 0) + (tally.in_progress ?? 0) + (tally.quoted ?? 0);

  return (
    <>
      <div className="page-header">
        <div className="eyebrow">Workspace · Week 4</div>
        <h1>Leads</h1>
        <p>{tally.open ?? 0} open · realtime — new leads appear without refresh.</p>
      </div>

      <div className="leads-grid full">
        <div className="leads-list">
          <nav className="tabs">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={t.key === 'open' ? '/leads' : `/leads?stage=${t.key}`}
                className={stage === t.key ? 'active' : ''}
              >
                {t.label}
                <span className="count">{tally[t.key] ?? 0}</span>
              </Link>
            ))}
          </nav>
          <LeadsRealtime initialRows={(rows ?? []).map((r: any) => ({ ...r, homes: Array.isArray(r.homes) ? r.homes[0] ?? null : r.homes })) as any} stage={stage} />
        </div>
      </div>
    </>
  );
}
