import { createClient } from '@uhs/db/server';
import type { LeadMilestone } from '@uhs/db';

export const metadata = { title: 'Milestones · Buyer portal' };
export const dynamic = 'force-dynamic';

const STATUS_TINT: Record<string, { bg: string; color: string; label: string }> = {
  pending:     { bg: '#f3f4f6', color: '#6b7280', label: 'Pending' },
  in_progress: { bg: '#fef3c7', color: '#854d0e', label: 'In progress' },
  complete:    { bg: '#dcfce7', color: '#166534', label: 'Complete' },
};

export default async function MilestonesPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  // Get linked leads
  const { data: links } = await sb
    .from('buyer_lead_links')
    .select('lead_id, org_id, leads(contact_name, home_id, homes(name, stock_no))')
    .eq('buyer_id', user.id)
    .eq('status', 'active');

  const leadIds = (links ?? []).map((l: { lead_id: string }) => l.lead_id);
  const linksByLead = new Map(
    (links ?? []).map((l: any) => [l.lead_id, l]),
  );

  let milestones: LeadMilestone[] = [];
  if (leadIds.length > 0) {
    const { data } = await sb
      .from('lead_milestones')
      .select('*')
      .in('lead_id', leadIds)
      .order('sort_order')
      .order('created_at');
    milestones = (data ?? []) as LeadMilestone[];
  }

  // Group milestones by lead
  const byLead = new Map<string, LeadMilestone[]>();
  for (const m of milestones) {
    if (!byLead.has(m.lead_id)) byLead.set(m.lead_id, []);
    byLead.get(m.lead_id)!.push(m);
  }

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow">Your purchase</div>
        <h1 style={{ marginTop: 6 }}>Milestones</h1>
        <p style={{ fontSize: 'var(--t-body-l)', color: 'var(--c-ink-soft)', marginTop: 8 }}>
          Where things stand on your purchase. Updated by your salesperson — refresh to see new entries.
        </p>
      </div>

      {leadIds.length === 0 ? (
        <div className="portal-card">
          <p style={{ margin: 0, color: 'var(--c-ink-mute)' }}>
            No active inquiries linked to your account yet. Once a salesperson connects you here,
            their updates will appear in this timeline.
          </p>
        </div>
      ) : Array.from(byLead.entries()).length === 0 ? (
        <div className="portal-card">
          <p style={{ margin: 0, color: 'var(--c-ink-mute)' }}>
            Nothing posted yet. Your salesperson will add updates as your purchase progresses.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {Array.from(byLead.entries()).map(([leadId, items]) => {
            const link = linksByLead.get(leadId) as any;
            const home = Array.isArray(link?.leads?.homes) ? link.leads.homes[0] : link?.leads?.homes;
            return (
              <div key={leadId} className="portal-card">
                <div className="portal-card-head">
                  <div>
                    <h2>{home?.name ?? 'Your inquiry'}</h2>
                    {home?.stock_no && (
                      <div className="sub">Stock {home.stock_no}</div>
                    )}
                  </div>
                </div>

                <ol style={{ listStyle: 'none', padding: 0, margin: 0, position: 'relative' }}>
                  {items.map((m, i) => {
                    const status = STATUS_TINT[m.status] ?? STATUS_TINT.pending!;
                    return (
                      <li key={m.id} style={{ display: 'flex', gap: 16, paddingBottom: i === items.length - 1 ? 0 : 20, position: 'relative' }}>
                        {i < items.length - 1 && (
                          <div style={{
                            position: 'absolute',
                            left: 11, top: 28,
                            bottom: 0,
                            width: 2,
                            background: 'var(--c-line)',
                          }} />
                        )}
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: status.bg, color: status.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700,
                          flexShrink: 0,
                          position: 'relative', zIndex: 1,
                        }}>
                          {m.status === 'complete' ? '✓' : i + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <strong style={{ font: '600 15px/1.3 var(--f-body)' }}>{m.title}</strong>
                            <span style={{
                              padding: '2px 8px', borderRadius: 10, fontSize: 10,
                              background: status.bg, color: status.color,
                              fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.04,
                            }}>{status.label}</span>
                          </div>
                          {m.body && (
                            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--c-ink-soft)', lineHeight: 1.5 }}>
                              {m.body}
                            </p>
                          )}
                          <div style={{ fontSize: 11, color: 'var(--c-ink-mute)', marginTop: 6 }}>
                            {m.completed_at
                              ? `Completed ${new Date(m.completed_at).toLocaleDateString()}`
                              : m.due_at
                                ? `Due ${new Date(m.due_at).toLocaleDateString()}`
                                : `Updated ${new Date(m.updated_at).toLocaleDateString()}`}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
