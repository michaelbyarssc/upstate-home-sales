import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createPublicClient } from '../../../lib/supabase';
import { formatCents } from '@uhs/db';

type Params = { token: string };

export const revalidate = 30;
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Params }) {
  const sb = createPublicClient();
  const { data } = await sb
    .from('public_quotes')
    .select('home_name, org_name')
    .eq('public_token', params.token)
    .maybeSingle();
  if (!data) return { title: 'Quote' };
  return { title: `Quote: ${data.home_name} · ${data.org_name}` };
}

export default async function QuotePage({ params }: { params: Params }) {
  const sb = createPublicClient();
  const { data: q } = await sb
    .from('public_quotes')
    .select('public_token, listed_price_cents, expires_at, created_at, home_id, home_name, stock_no, beds, baths, sqft, headline, description, org_name, brand_color')
    .eq('public_token', params.token)
    .maybeSingle();

  if (!q) {
    return (
      <main style={{ padding: '120px 24px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--f-display)' }}>Quote not found</h1>
        <p style={{ marginTop: 12, color: 'var(--c-ink-mute)' }}>
          This link may have expired. Please contact your salesperson for a fresh quote.
        </p>
        <Link href="/" className="btn btn-secondary" style={{ marginTop: 24 }}>← Home</Link>
      </main>
    );
  }

  const expires = new Date(q.expires_at);
  const created = new Date(q.created_at);
  const daysLeft = Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 86_400_000));

  return (
    <main className="section">
      <div className="inner section-narrow">
        <div style={{
          background: '#fff',
          border: '1px solid var(--c-line)',
          borderRadius: 'var(--r-3)',
          overflow: 'hidden',
        }}>
          <header style={{
            padding: 'var(--s-8) var(--s-8)',
            background: q.brand_color ?? 'var(--c-bg)',
            color: q.brand_color ? '#fff' : 'var(--c-ink)',
          }}>
            <div className="eyebrow" style={{ color: q.brand_color ? 'rgba(255,255,255,0.8)' : 'var(--c-ink-mute)' }}>
              {q.org_name}
            </div>
            <h1 style={{ marginTop: 8, fontSize: 'var(--t-display-l)', color: q.brand_color ? '#fff' : 'var(--c-ink)' }}>
              Your quote
            </h1>
            <p style={{ marginTop: 8, color: q.brand_color ? 'rgba(255,255,255,0.85)' : 'var(--c-ink-soft)' }}>
              {q.home_name} · {q.stock_no}
            </p>
          </header>

          <section style={{ padding: 'var(--s-10) var(--s-8)' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              padding: 'var(--s-5) 0', borderBottom: '1px solid var(--c-line)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Quoted price</div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 'var(--t-display-m)' }}>
                  {formatCents(q.listed_price_cents)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--c-ink-mute)', marginTop: 4 }}>
                  Includes setup, delivery, and add-ons as itemized.
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Valid for</div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 'var(--t-h2)' }}>{daysLeft} days</div>
                <div style={{ fontSize: 12, color: 'var(--c-ink-mute)', marginTop: 4 }}>
                  Expires {expires.toLocaleDateString()}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 'var(--s-8)' }}>
              <h3 style={{ marginBottom: 'var(--s-3)' }}>About this home</h3>
              {q.headline && <p style={{ fontSize: 'var(--t-body-l)' }}>{q.headline}</p>}
              <div className="spec-grid" style={{ marginTop: 'var(--s-3)' }}>
                <div className="row"><span className="lbl">Stock #</span><span>{q.stock_no}</span></div>
                <div className="row"><span className="lbl">Beds / baths</span><span>{q.beds ?? '—'} / {q.baths ?? '—'}</span></div>
                <div className="row"><span className="lbl">Square feet</span><span>{q.sqft?.toLocaleString() ?? '—'}</span></div>
                <div className="row"><span className="lbl">Quoted on</span><span>{created.toLocaleDateString()}</span></div>
              </div>
              {q.description && (
                <p style={{ marginTop: 'var(--s-6)', whiteSpace: 'pre-wrap', color: 'var(--c-ink-soft)' }}>
                  {q.description}
                </p>
              )}
            </div>

            <div style={{
              marginTop: 'var(--s-10)',
              padding: 'var(--s-5)',
              background: 'var(--c-bg)',
              borderRadius: 'var(--r-2)',
            }}>
              <h3 style={{ marginBottom: 'var(--s-2)' }}>Next steps</h3>
              <ol style={{ paddingLeft: 22, color: 'var(--c-ink-soft)', lineHeight: 1.8 }}>
                <li>Reply to the email this quote came from with any questions.</li>
                <li>Pre-qualify with one of our lender partners — see <Link href="/financing">financing</Link>.</li>
                <li>Schedule a walk-through at the lot. We&rsquo;re open seven days.</li>
              </ol>
            </div>

            <div style={{ marginTop: 'var(--s-8)', display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Link href="/financing" className="btn btn-primary">Pre-qualify</Link>
              <Link href="/contact" className="btn btn-secondary">Contact us</Link>
            </div>
          </section>

          <footer style={{
            padding: 'var(--s-5) var(--s-8)',
            borderTop: '1px solid var(--c-line)',
            fontSize: 12,
            color: 'var(--c-ink-mute)',
          }}>
            Pricing snapshotted on {created.toLocaleDateString()}. The dealer&rsquo;s public listing
            price may change after this date — your quote stays at {formatCents(q.listed_price_cents)} through expiry.
          </footer>
        </div>
      </div>
    </main>
  );
}
