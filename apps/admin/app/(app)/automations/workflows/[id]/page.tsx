import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@uhs/db/server';
import type { Campaign, WorkflowRule, WorkflowRun } from '@uhs/db';
import { WorkflowEditor } from './workflow-editor';

export const dynamic = 'force-dynamic';

export default async function WorkflowDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: rule }, { data: campaigns }, { data: members }, { data: runs }] = await Promise.all([
    supabase.from('workflow_rules').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('campaigns')
      .select('id, name, status')
      .eq('status', 'active')
      .order('name'),
    supabase
      .from('org_members')
      .select('user_id, role')
      .eq('status', 'active')
      .in('role', ['owner', 'manager', 'sales']),
    supabase
      .from('workflow_runs')
      .select('id, status, event, error_text, started_at, finished_at, created_at')
      .eq('rule_id', params.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  if (!rule) notFound();

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link href="/automations/workflows" style={{ color: 'var(--adm-ink-mute)', fontSize: 13, textDecoration: 'none' }}>
          ← Back to workflows
        </Link>
      </div>

      <WorkflowEditor
        rule={rule as WorkflowRule}
        campaigns={(campaigns ?? []) as Pick<Campaign, 'id' | 'name' | 'status'>[]}
        members={(members ?? []) as Array<{ user_id: string; role: string }>}
      />

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Recent runs</h2>
        {(runs ?? []).length === 0 ? (
          <div className="auto-empty" style={{ padding: 32 }}>
            <p style={{ marginBottom: 0 }}>No runs yet. Trigger the event to see runs appear here.</p>
          </div>
        ) : (
          <div className="auto-list">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {(runs as WorkflowRun[]).map((r) => {
                  const dur = r.started_at && r.finished_at
                    ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()))
                    : null;
                  return (
                    <tr key={r.id}>
                      <td style={{ fontSize: 12, color: 'var(--adm-ink-mute)' }}>
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td><code style={{ fontSize: 11 }}>{r.event}</code></td>
                      <td>
                        <span className={`pill ${
                          r.status === 'success' ? 'enabled'
                            : r.status === 'error' ? 'draft'
                            : r.status === 'pending' || r.status === 'running' ? 'paused'
                            : 'archived'
                        }`} style={r.status === 'error' ? { background: '#fee2e2', color: '#991b1b' } : undefined}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--adm-ink-mute)' }}>
                        {dur != null ? `${dur}ms` : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: '#991b1b', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.error_text ?? undefined}>
                        {r.error_text ?? ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
