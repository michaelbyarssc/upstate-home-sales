import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import type { WorkflowRule } from '@uhs/db';

export const dynamic = 'force-dynamic';

export default async function WorkflowsListPage() {
  const supabase = createClient();
  const [{ data: rules }, { data: runs }] = await Promise.all([
    supabase
      .from('workflow_rules')
      .select('id, name, event, enabled, actions, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('workflow_runs')
      .select('rule_id, status'),
  ]);

  const totals = new Map<string, { total: number; errored: number }>();
  for (const r of (runs ?? []) as Array<{ rule_id: string; status: string }>) {
    const t = totals.get(r.rule_id) ?? { total: 0, errored: 0 };
    t.total++;
    if (r.status === 'error') t.errored++;
    totals.set(r.rule_id, t);
  }

  const rows = (rules ?? []) as Array<Pick<WorkflowRule, 'id' | 'name' | 'event' | 'enabled' | 'actions' | 'created_at'>>;

  return (
    <>
      <div className="auto-toolbar">
        <Link
          href="/automations/workflows/new"
          style={{
            background: 'var(--adm-accent)', color: '#fff',
            padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          + New rule
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="auto-empty">
          <h3>No workflow rules yet</h3>
          <p>
            Rules run actions automatically when an event fires — assign a lead, enroll in a campaign,
            change a stage, send a notification.
          </p>
        </div>
      ) : (
        <div className="auto-list">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Event</th>
                <th>Actions</th>
                <th>Enabled</th>
                <th>Runs</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const stats = totals.get(r.id) ?? { total: 0, errored: 0 };
                const actionTypes = (r.actions ?? []).map((a) => a.type).join(', ');
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/automations/workflows/${r.id}`} className="row-link">{r.name}</Link>
                    </td>
                    <td><code style={{ fontSize: 11 }}>{r.event}</code></td>
                    <td style={{ color: 'var(--adm-ink-mute)', fontSize: 12 }}>
                      {actionTypes || <em>none yet</em>}
                    </td>
                    <td>
                      <span className={`pill ${r.enabled ? 'enabled' : 'disabled'}`}>
                        {r.enabled ? 'enabled' : 'disabled'}
                      </span>
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{stats.total}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: stats.errored > 0 ? '#b3261e' : 'var(--adm-ink-mute)' }}>
                      {stats.errored}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
