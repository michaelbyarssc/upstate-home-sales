import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { publicPhotoUrl } from '../../../lib/supabase';
import { formatCompactPrice, formatMonthly } from '../../../lib/finance';

export const metadata = { title: 'Dashboard · Buyer portal' };
export const dynamic = 'force-dynamic';

export default async function PortalDashboard() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null; // layout redirect handles this

  const { data: buyer } = await sb
    .from('buyers')
    .select('full_name, email')
    .eq('id', user.id)
    .maybeSingle();

  // Suggested homes (with home detail)
  const { data: suggestedRaw } = await sb
    .from('buyer_suggested_homes')
    .select('id, home_id, note, suggested_at, buyer_state')
    .eq('buyer_id', user.id)
    .neq('buyer_state', 'dismissed')
    .order('suggested_at', { ascending: false })
    .limit(8);

  const suggestedIds = (suggestedRaw ?? []).map((s: { home_id: string }) => s.home_id);
  let suggestedHomes: Array<{
    home_id: string;
    state: string;
    note: string | null;
    home: {
      stock_no: string;
      name: string;
      beds: number | null;
      baths: number | null;
      sqft: number | null;
      listed_price_cents: number | null;
      prices_hidden: boolean;
      photo: string | null;
    } | null;
  }> = [];
  if (suggestedIds.length > 0) {
    const { data: homes } = await sb
      .from('public_homes')
      .select('id, stock_no, name, beds, baths, sqft, listed_price_cents, prices_hidden, public_home_photos(storage_path, sort_order)')
      .in('id', suggestedIds);
    const byId = new Map((homes ?? []).map((h: any) => [h.id, h]));
    suggestedHomes = (suggestedRaw ?? []).map((s: any) => {
      const h = byId.get(s.home_id);
      return {
        home_id: s.home_id,
        state: s.buyer_state,
        note: s.note,
        home: h
          ? {
              stock_no: h.stock_no,
              name: h.name,
              beds: h.beds,
              baths: h.baths,
              sqft: h.sqft,
              listed_price_cents: h.listed_price_cents,
              prices_hidden: h.prices_hidden,
              photo: h.public_home_photos?.[0] ? publicPhotoUrl(h.public_home_photos[0].storage_path) : null,
            }
          : null,
      };
    });
  }

  // Recent milestones across all linked leads (read-only; full detail on /milestones)
  const { data: links } = await sb
    .from('buyer_lead_links')
    .select('lead_id')
    .eq('buyer_id', user.id)
    .eq('status', 'active');
  const leadIds = (links ?? []).map((l: { lead_id: string }) => l.lead_id);

  const { data: recentMilestones } = leadIds.length > 0
    ? await sb
        .from('lead_milestones')
        .select('id, title, status, lead_id, updated_at')
        .in('lead_id', leadIds)
        .order('updated_at', { ascending: false })
        .limit(5)
    : { data: [] };

  return (
    <>
      <div style={{ marginBottom: 32 }}>
        <div className="eyebrow">Welcome back</div>
        <h1 style={{ marginTop: 6 }}>Hi, {buyer?.full_name?.split(' ')[0] ?? 'there'}.</h1>
        <p style={{ fontSize: 'var(--t-body-l)', color: 'var(--c-ink-soft)', marginTop: 8 }}>
          Here&rsquo;s what&rsquo;s waiting for you today.
        </p>
      </div>

      <div className="portal-dash-grid">
        {/* Suggested homes */}
        <section className="portal-card">
          <div className="portal-card-head">
            <div>
              <h2>Suggested for you</h2>
              <div className="sub">Picks your salesperson hand-selected.</div>
            </div>
            <Link href="/inventory" style={{ fontSize: 13, color: 'var(--c-accent)' }}>
              Browse all →
            </Link>
          </div>
          {suggestedHomes.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--c-ink-mute)', background: 'var(--c-bg)', borderRadius: 'var(--r-1)' }}>
              No suggestions yet. Once you talk to a salesperson they&rsquo;ll pin homes here.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {suggestedHomes.map((s) => s.home && (
                <Link
                  key={s.home_id}
                  href={`/inventory/${encodeURIComponent(s.home.stock_no)}`}
                  style={{
                    display: 'block',
                    background: '#fff',
                    border: '1px solid var(--c-line)',
                    borderRadius: 'var(--r-1)',
                    overflow: 'hidden',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      aspectRatio: '5/3',
                      background: s.home.photo ? `url(${s.home.photo}) center/cover no-repeat` : 'linear-gradient(140deg, #b8a384, #5e4f3a)',
                    }}
                  />
                  <div style={{ padding: 12 }}>
                    <div style={{ font: '600 14px/1.3 var(--f-body)' }}>{s.home.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--c-ink-mute)', marginTop: 4 }}>
                      {s.home.beds ?? '—'} bed · {s.home.baths ?? '—'} bath
                      {s.home.sqft ? ` · ${s.home.sqft.toLocaleString()} sqft` : ''}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                      {s.home.prices_hidden || s.home.listed_price_cents == null
                        ? <span style={{ color: 'var(--c-ink-mute)', fontWeight: 500 }}>Contact for pricing</span>
                        : <>{formatCompactPrice(s.home.listed_price_cents)} <span style={{ color: 'var(--c-ink-mute)', fontWeight: 500 }}>| {formatMonthly(s.home.listed_price_cents)}</span></>}
                    </div>
                    {s.note && (
                      <div style={{ marginTop: 8, padding: 8, background: 'var(--c-bg)', borderRadius: 4, fontSize: 12, color: 'var(--c-ink-soft)', fontStyle: 'italic' }}>
                        &ldquo;{s.note}&rdquo;
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Quick links + recent milestones */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="portal-card">
            <h3 style={{ font: '600 15px/1 var(--f-body)', marginBottom: 12 }}>Your account</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li><Link href="/portal/documents" style={{ color: 'var(--c-ink)', textDecoration: 'none' }}>📄 Documents</Link></li>
              <li><Link href="/portal/milestones" style={{ color: 'var(--c-ink)', textDecoration: 'none' }}>🛣️ Purchase milestones</Link></li>
              <li><Link href="/portal/profile" style={{ color: 'var(--c-ink)', textDecoration: 'none' }}>⚙️ Profile &amp; notifications</Link></li>
            </ul>
          </div>

          <div className="portal-card">
            <h3 style={{ font: '600 15px/1 var(--f-body)', marginBottom: 12 }}>Recent activity</h3>
            {(recentMilestones ?? []).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--c-ink-mute)', margin: 0 }}>
                No updates yet. Your salesperson will post milestones as your purchase moves forward.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {recentMilestones!.map((m: any) => (
                  <li key={m.id} style={{ fontSize: 13, color: 'var(--c-ink)' }}>
                    <span style={{
                      display: 'inline-block',
                      width: 8, height: 8, borderRadius: '50%',
                      marginRight: 8,
                      background: m.status === 'complete' ? '#22c55e' : m.status === 'in_progress' ? '#eab308' : '#cbd5e1',
                    }} />
                    {m.title}
                    <div style={{ fontSize: 11, color: 'var(--c-ink-mute)', marginLeft: 16, marginTop: 2 }}>
                      {new Date(m.updated_at).toLocaleDateString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
