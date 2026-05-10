import Link from 'next/link';
import { createPublicClient } from '../../../lib/supabase';
import { formatCents, type PublicHomeDesign, type PublicHomeDesignSelection } from '@uhs/db';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export default async function DesignSharePage({ params }: { params: { token: string } }) {
  const sb = createPublicClient();
  const [{ data: design }, { data: selections }] = await Promise.all([
    sb.from('public_home_designs').select('*').eq('share_token', params.token).maybeSingle(),
    sb.from('public_home_design_selections').select('*').eq('share_token', params.token),
  ]);

  if (!design) {
    return (
      <main style={{ padding: '120px 24px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--f-display)' }}>Design not found</h1>
        <p style={{ marginTop: 12, color: 'var(--c-ink-mute)' }}>
          This share link may have been revoked. Ask your salesperson for a fresh link.
        </p>
        <Link href="/" className="btn btn-secondary" style={{ marginTop: 24 }}>← Home</Link>
      </main>
    );
  }

  const d = design as PublicHomeDesign;
  const sels = (selections ?? []) as PublicHomeDesignSelection[];

  return (
    <main className="section">
      <div className="inner section-narrow">
        <div className="eyebrow" style={{ color: d.org_brand_color ?? 'var(--c-brand)' }}>{d.org_name}</div>
        <h1 style={{ fontFamily: 'var(--f-display)', fontSize: 'var(--t-display-m)', marginTop: 'var(--s-2)' }}>
          Your custom {d.home_name}
        </h1>
        <p style={{ marginTop: 'var(--s-2)', color: 'var(--c-ink-mute)' }}>
          Stock #{d.home_stock_no} · {d.home_beds ?? '—'} bd / {d.home_baths ?? '—'} ba · {d.home_sqft?.toLocaleString() ?? '—'} sf
        </p>

        <div style={{
          marginTop: 'var(--s-6)',
          padding: 'var(--s-6)',
          background: '#fff',
          border: '1px solid var(--c-line)',
          borderRadius: 'var(--r-3)',
        }}>
          <div className="eyebrow">Total</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 'var(--t-display-s)', marginTop: 'var(--s-2)' }}>
            {d.design_price_display === 'hidden'
              ? 'Contact for pricing'
              : formatCents(d.total_price_cents)}
          </div>

          <h3 style={{ marginTop: 'var(--s-6)' }}>Selections</h3>
          {sels.length === 0 ? (
            <p style={{ color: 'var(--c-ink-mute)', fontSize: 13 }}>(default configuration)</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 'var(--s-3) 0 0', padding: 0, display: 'grid', gap: 6 }}>
              {sels.map((s) => (
                <li key={s.option_id} style={{
                  display: 'flex', justifyContent: 'space-between',
                  borderBottom: '1px dashed var(--c-line)', padding: '6px 0', fontSize: 14,
                }}>
                  <span><strong>{s.option_label}:</strong> {s.value_label}</span>
                  {s.snapshot_price_delta_cents !== 0 && (
                    <span style={{ color: 'var(--c-ink-mute)' }}>
                      {s.snapshot_price_delta_cents > 0 ? '+' : ''}{formatCents(s.snapshot_price_delta_cents)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div style={{ marginTop: 'var(--s-6)', display: 'flex', gap: 12 }}>
            <Link href={`/inventory/${encodeURIComponent(d.home_stock_no)}/design`} className="btn btn-secondary">
              Edit this design
            </Link>
            <Link href="/contact" className="btn btn-primary">
              Get a quote
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
