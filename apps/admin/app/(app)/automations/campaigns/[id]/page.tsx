import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@uhs/db/server';
import type { Campaign, CampaignStep, CampaignEnrollment } from '@uhs/db';
import { CampaignEditor } from './campaign-editor';

export const dynamic = 'force-dynamic';

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: campaign }, { data: steps }, { data: enrollments }] = await Promise.all([
    supabase.from('campaigns').select('*').eq('id', params.id).maybeSingle(),
    supabase.from('campaign_steps').select('*').eq('campaign_id', params.id).order('step_order'),
    supabase
      .from('campaign_enrollments')
      .select('id, status, lead_id, current_step, next_send_at, enrolled_at, leads(contact_name)')
      .eq('campaign_id', params.id)
      .order('enrolled_at', { ascending: false })
      .limit(20),
  ]);

  if (!campaign) notFound();

  const enrollmentsArr = (enrollments ?? []) as Array<CampaignEnrollment & { leads?: { contact_name: string } | null }>;
  const counts = { active: 0, completed: 0, unsubscribed: 0, errored: 0 };
  for (const e of enrollmentsArr) counts[e.status as keyof typeof counts] = (counts[e.status as keyof typeof counts] ?? 0) + 1;

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link href="/automations/campaigns" style={{ color: 'var(--adm-ink-mute)', fontSize: 13, textDecoration: 'none' }}>
          ← Back to campaigns
        </Link>
      </div>

      <CampaignEditor
        campaign={campaign as Campaign}
        steps={(steps ?? []) as CampaignStep[]}
      />

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Recent enrollments</h2>
        {enrollmentsArr.length === 0 ? (
          <div className="auto-empty" style={{ padding: 32 }}>
            <p style={{ marginBottom: 0 }}>No enrollments yet.</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 12 }}>
              <span><span className="pill active">active</span> {counts.active}</span>
              <span><span className="pill" style={{ background: '#dbeafe', color: '#1e40af' }}>completed</span> {counts.completed}</span>
              <span><span className="pill paused">unsubscribed</span> {counts.unsubscribed}</span>
              <span><span className="pill" style={{ background: '#fee2e2', color: '#991b1b' }}>errored</span> {counts.errored}</span>
            </div>
            <div className="auto-list">
              <table>
                <thead>
                  <tr>
                    <th>Lead</th>
                    <th>Status</th>
                    <th>Current step</th>
                    <th>Next send</th>
                    <th>Enrolled</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollmentsArr.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <Link href={`/leads/${e.lead_id}`} className="row-link">
                          {e.leads?.contact_name ?? <code style={{ fontSize: 11 }}>{e.lead_id.slice(0, 8)}</code>}
                        </Link>
                      </td>
                      <td><span className={`pill ${e.status === 'active' ? 'active' : e.status === 'errored' ? 'draft' : 'paused'}`}>{e.status}</span></td>
                      <td>{e.current_step}</td>
                      <td style={{ fontSize: 12, color: 'var(--adm-ink-mute)' }}>
                        {e.next_send_at ? new Date(e.next_send_at).toLocaleString() : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--adm-ink-mute)' }}>
                        {new Date(e.enrolled_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
