import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { formatCents } from '@uhs/db';

export const metadata = { title: 'Designs · Buyer portal' };
export const dynamic = 'force-dynamic';

type DesignRow = {
  id: string;
  share_token: string;
  base_price_cents: number;
  total_price_cents: number;
  created_at: string;
  updated_at: string;
  homes: { name: string; stock_no: string } | null;
};

export default async function PortalDesignsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data: rows } = await sb
    .from('home_designs')
    .select('id, share_token, base_price_cents, total_price_cents, created_at, updated_at, homes(name, stock_no)')
    .eq('buyer_id', user.id)
    .order('created_at', { ascending: false });

  const designs = (rows ?? []) as unknown as DesignRow[];

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow">Configure</div>
        <h1 style={{ marginTop: 6 }}>Your designs</h1>
        <p style={{ fontSize: 'var(--t-body-l)', color: 'var(--c-ink-soft)', marginTop: 8 }}>
          Every home you&rsquo;ve customized lives here. Share a design with a friend, pick it back up where you
          left off, or request a quote based on your selections.
        </p>
      </div>

      {designs.length === 0 ? (
        <div style={{
          padding: 'var(--s-6)',
          border: '1px dashed var(--c-line)',
          borderRadius: 'var(--r-3)',
          textAlign: 'center',
          color: 'var(--c-ink-mute)',
        }}>
          <p style={{ marginBottom: 12 }}>You haven&rsquo;t saved any designs yet.</p>
          <Link href="/inventory" className="btn btn-primary">Browse homes</Link>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--s-4)' }}>
          {designs.map((d) => {
            const home = d.homes;
            const homeName = home?.name ?? 'Home design';
            const stockNo = home?.stock_no ?? null;
            const delta = d.total_price_cents - d.base_price_cents;
            return (
              <li
                key={d.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 'var(--s-4)',
                  padding: 'var(--s-5)',
                  background: '#fff',
                  border: '1px solid var(--c-line)',
                  borderRadius: 'var(--r-3)',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div className="eyebrow" style={{ fontSize: 11 }}>
                    {stockNo ? `Stock #${stockNo}` : 'Custom design'} ·{' '}
                    {new Date(d.created_at).toLocaleDateString()}
                  </div>
                  <h3 style={{ marginTop: 4, marginBottom: 6, fontFamily: 'var(--f-display)' }}>{homeName}</h3>
                  <div style={{ fontSize: 14, color: 'var(--c-ink-soft)' }}>
                    Total {formatCents(d.total_price_cents)}
                    {delta !== 0 && (
                      <span style={{ marginLeft: 8, color: 'var(--c-ink-mute)' }}>
                        ({delta > 0 ? '+' : ''}{formatCents(delta)} in options)
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  <Link href={`/d/${d.share_token}`} className="btn btn-secondary" style={{ fontSize: 13 }}>
                    View / share
                  </Link>
                  {stockNo && (
                    <Link
                      href={`/inventory/${encodeURIComponent(stockNo)}/design?design=${d.id}`}
                      className="btn btn-primary"
                      style={{ fontSize: 13 }}
                    >
                      Re-edit
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
