import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { formatCents, type LeadStage } from '@uhs/db';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = createClient();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [
    { data: invStats },
    { count: openLeads },
    { count: leads7d },
    { count: hotLeads },
    { data: recentLeads },
    { data: pipelineHomes },
  ] = await Promise.all([
    supabase.from('homes').select('status, listed_price_cents').is('deleted_at', null),
    supabase.from('leads').select('id', { count: 'exact', head: true }).in('stage', ['new', 'in_progress', 'quoted'] as LeadStage[]),
    supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('is_hot', true),
    supabase
      .from('leads')
      .select('id, contact_name, stage, created_at, homes(name, stock_no)')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('homes')
      .select('id, name, stock_no, listed_price_cents, on_lot_since')
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('on_lot_since', { ascending: true, nullsFirst: false })
      .limit(5),
  ]);

  const inv = invStats ?? [];
  const totalListings = inv.length;
  const published = inv.filter((h) => h.status === 'published').length;
  const drafts = inv.filter((h) => h.status === 'draft').length;
  const sold = inv.filter((h) => h.status === 'sold').length;
  const inventoryValue = inv
    .filter((h) => h.status === 'published')
    .reduce((s, h) => s + (h.listed_price_cents ?? 0), 0);

  return (
    <>
      <div className="page-header">
        <div className="eyebrow">Workspace</div>
        <h1>Dashboard</h1>
        <p>This week: {leads7d ?? 0} new leads · {openLeads ?? 0} open · {hotLeads ?? 0} hot.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <Kpi label="Open leads" value={(openLeads ?? 0).toString()} sub={`${leads7d ?? 0} this week`} href="/leads" />
        <Kpi label="Hot leads" value={(hotLeads ?? 0).toString()} sub="Marked priority" href="/leads" />
        <Kpi label="Published listings" value={published.toString()} sub={`${totalListings} total · ${drafts} drafts`} href="/inventory?status=published" />
        <Kpi label="Inventory value" value={formatCents(inventoryValue)} sub={`${sold} sold lifetime`} href="/inventory" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, marginTop: 24 }}>
        <div className="card">
          <div className="card-head">
            <h3>Recent leads</h3>
            <div className="sub">Last 8 across all stages.</div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {(recentLeads ?? []).length === 0 ? (
                  <tr><td style={{ padding: 24, textAlign: 'center', color: 'var(--adm-ink-mute)' }}>No leads yet.</td></tr>
                ) : (
                  (recentLeads ?? []).map((l: any) => {
                    const home = Array.isArray(l.homes) ? l.homes[0] : l.homes;
                    return (
                      <tr key={l.id} style={{ borderBottom: '1px solid #efeae0' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <Link href={`/leads/${l.id}`} style={{ color: 'var(--adm-ink)', textDecoration: 'none', fontWeight: 500 }}>
                            {l.contact_name}
                          </Link>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--adm-ink-mute)' }}>
                          {home ? `${home.name} · ${home.stock_no}` : 'general'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <span className="bd bd-soft">{l.stage.replace('_', ' ')}</span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--adm-ink-mute)', fontSize: 11 }}>
                          {new Date(l.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Aging inventory</h3>
            <div className="sub">Oldest published homes.</div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {(pipelineHomes ?? []).length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--adm-ink-mute)', fontSize: 13 }}>No published homes.</div>
            ) : (
              (pipelineHomes ?? []).map((h: any) => {
                const days = h.on_lot_since
                  ? Math.floor((Date.now() - new Date(h.on_lot_since).getTime()) / 86_400_000)
                  : null;
                return (
                  <div key={h.id} style={{ padding: '12px 14px', borderBottom: '1px solid #efeae0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Link href={`/inventory/${h.id}`} style={{ color: 'var(--adm-ink)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
                      {h.name}
                      <div style={{ color: 'var(--adm-ink-mute)', fontSize: 11, marginTop: 2 }}>{h.stock_no}</div>
                    </Link>
                    <span style={{ fontSize: 11, color: days != null && days > 90 ? '#a53a2c' : 'var(--adm-ink-mute)' }}>
                      {days != null ? `${days}d` : '—'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, sub, href }: { label: string; value: string; sub: string; href: string }) {
  return (
    <Link href={href} style={{
      display: 'block', textDecoration: 'none', color: 'inherit',
      background: '#fff', border: '1px solid var(--adm-line)', borderRadius: 8, padding: 18,
    }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 28, color: 'var(--adm-ink)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--adm-ink-mute)', marginTop: 4 }}>{sub}</div>
    </Link>
  );
}
