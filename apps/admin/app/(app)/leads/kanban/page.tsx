import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { KanbanBoard } from './kanban-board';
import type { KanbanCard } from './types';
import '../leads.css';

export default async function LeadsKanbanPage() {
  const supabase = createClient();

  const { data: rows } = await supabase
    .from('leads')
    .select('id, contact_name, email, phone, stage, source, is_hot, assignee_id, home_id, created_at, updated_at, homes(name, stock_no, listed_price_cents)')
    .order('updated_at', { ascending: false })
    .limit(500);

  const cards = (rows ?? []).map((r: any) => ({
    ...r,
    homes: Array.isArray(r.homes) ? r.homes[0] ?? null : r.homes,
  }));

  return (
    <>
      <div className="page-header">
        <div className="eyebrow">Workspace · Pipeline</div>
        <h1>Leads · Kanban</h1>
        <p>
          Drag cards to advance the deal.{' '}
          <Link href="/leads" style={{ color: 'var(--adm-accent)' }}>Back to inbox view</Link>
        </p>
      </div>
      <KanbanBoard initial={cards as KanbanCard[]} />
    </>
  );
}
