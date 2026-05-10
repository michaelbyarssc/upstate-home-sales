import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import type { Campaign } from '@uhs/db';

export const dynamic = 'force-dynamic';

export default async function CampaignsListPage() {
  const supabase = createClient();
  const [{ data: campaigns }, { data: enrollmentCounts }] = await Promise.all([
    supabase
      .from('campaigns')
      .select('id, name, channel, status, trigger_event, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('campaign_enrollments')
      .select('campaign_id, status'),
  ]);

  const counts = new Map<string, number>();
  for (const e of (enrollmentCounts ?? []) as Array<{ campaign_id: string; status: string }>) {
    if (e.status === 'active') counts.set(e.campaign_id, (counts.get(e.campaign_id) ?? 0) + 1);
  }

  const rows = (campaigns ?? []) as Array<Pick<Campaign, 'id' | 'name' | 'channel' | 'status' | 'trigger_event' | 'created_at'>>;

  return (
    <>
      <div className="auto-toolbar">
        <Link
          href="/automations/campaigns/new"
          style={{
            background: 'var(--adm-accent)', color: '#fff',
            padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          + New campaign
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="auto-empty">
          <h3>No campaigns yet</h3>
          <p>Create a drip sequence to follow up with leads automatically.</p>
        </div>
      ) : (
        <div className="auto-list">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Active enrollments</th>
                <th>Trigger</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/automations/campaigns/${c.id}`} className="row-link">
                      {c.name}
                    </Link>
                  </td>
                  <td><span className={`pill ${c.channel}`}>{c.channel}</span></td>
                  <td><span className={`pill ${c.status}`}>{c.status}</span></td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{counts.get(c.id) ?? 0}</td>
                  <td style={{ color: 'var(--adm-ink-mute)', fontSize: 12 }}>
                    {c.trigger_event ?? <em>manual</em>}
                  </td>
                  <td style={{ color: 'var(--adm-ink-mute)', fontSize: 12 }}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
