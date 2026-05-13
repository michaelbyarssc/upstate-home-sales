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
    .from('public_invoices')
    .select('home_name, org_name, invoice_number')
    .eq('public_token', params.token)
    .maybeSingle();
  if (!data) return { title: 'Invoice' };
  return { title: `Invoice #${data.invoice_number} · ${data.org_name}` };
}

export default async function InvoicePage({ params }: { params: Params }) {
  const sb = createPublicClient();
  const { data: inv } = await sb
    .from('public_invoices')
    .select('public_token, invoice_number, listed_price_cents, line_items_jsonb, notes_jsonb, payment_terms, payment_instructions, due_at, created_at, home_name, stock_no, org_name, brand_color, paid_cents')
    .eq('public_token', params.token)
    .maybeSingle();

  if (!inv) {
    return (
      <main style={{ padding: '120px 24px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--f-display)' }}>Invoice not found</h1>
        <p style={{ marginTop: 12, color: 'var(--c-ink-mute)' }}>
          This link may have expired or is invalid. Please contact your salesperson.
        </p>
        <Link href="/" className="btn btn-secondary" style={{ marginTop: 24 }}>← Home</Link>
      </main>
    );
  }

  const created = new Date(inv.created_at);
  const dueDate = inv.due_at ? new Date(inv.due_at) : null;
  const lineItems = (inv.line_items_jsonb as Array<{ description: string; amount_cents: number | null }> | null) ?? [];
  const notes = (inv.notes_jsonb as string[] | null) ?? [];
  const paidCents = inv.paid_cents ?? 0;
  const balanceCents = inv.listed_price_cents - paidCents;

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
            background: inv.brand_color ?? 'var(--c-bg)',
            color: inv.brand_color ? '#fff' : 'var(--c-ink)',
          }}>
            <div className="eyebrow" style={{ color: inv.brand_color ? 'rgba(255,255,255,0.8)' : 'var(--c-ink-mute)' }}>
              {inv.org_name}
            </div>
            <h1 style={{ marginTop: 8, fontSize: 'var(--t-display-l)', color: inv.brand_color ? '#fff' : 'var(--c-ink)' }}>
              Invoice #{inv.invoice_number}
            </h1>
            <p style={{ marginTop: 8, color: inv.brand_color ? 'rgba(255,255,255,0.85)' : 'var(--c-ink-soft)' }}>
              {inv.home_name} · {inv.stock_no}
            </p>
          </header>

          <section style={{ padding: 'var(--s-10) var(--s-8)' }}>
            {/* Line items table */}
            {lineItems.length > 0 && (
              <div style={{ marginBottom: 'var(--s-6)' }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Line Items</div>
                {lineItems.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px',
                    background: i % 2 === 0 ? 'var(--c-bg)' : 'transparent',
                    borderRadius: 4,
                  }}>
                    <span style={{ fontSize: 14 }}>{item.description}</span>
                    <span style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', color: item.amount_cents != null ? 'var(--c-ink)' : 'var(--c-ink-mute)' }}>
                      {item.amount_cents != null ? formatCents(item.amount_cents) : 'Included'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Total / Paid / Balance */}
            <div style={{
              padding: 'var(--s-5) var(--s-4)',
              background: '#f6efe6', borderRadius: 'var(--r-2)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: paidCents > 0 ? 12 : 0 }}>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Total</div>
                  <div style={{ fontFamily: 'var(--f-display)', fontSize: 'var(--t-display-m)' }}>
                    {formatCents(inv.listed_price_cents)}
                  </div>
                </div>
                {dueDate && (
                  <div style={{ textAlign: 'right' }}>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>Due date</div>
                    <div style={{ fontFamily: 'var(--f-display)', fontSize: 'var(--t-h2)' }}>
                      {dueDate.toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>

              {paidCents > 0 && (
                <>
                  <div style={{ borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 14, color: 'var(--c-ink-soft)' }}>Paid to date</span>
                    <span style={{ fontSize: 14, color: '#2a7d3f', fontWeight: 600 }}>{formatCents(paidCents)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>Balance due</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#b9532a' }}>{formatCents(balanceCents)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Payment terms */}
            {inv.payment_terms && (
              <div style={{ marginTop: 'var(--s-6)' }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Payment Terms</div>
                <p style={{ color: 'var(--c-ink-soft)', lineHeight: 1.6 }}>{inv.payment_terms}</p>
              </div>
            )}

            {/* Payment instructions */}
            {inv.payment_instructions && (
              <div style={{ marginTop: 'var(--s-6)' }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Payment Instructions</div>
                <p style={{ whiteSpace: 'pre-wrap', color: 'var(--c-ink-soft)', lineHeight: 1.6 }}>{inv.payment_instructions}</p>
              </div>
            )}

            {/* Notes */}
            {notes.length > 0 && (
              <div style={{ marginTop: 'var(--s-6)' }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Notes</div>
                <ul style={{ paddingLeft: 20, color: 'var(--c-ink-soft)', lineHeight: 1.8, margin: 0 }}>
                  {notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            )}

            <div style={{ marginTop: 'var(--s-8)', display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Link href="/contact" className="btn btn-primary">Contact us</Link>
            </div>
          </section>

          <footer style={{
            padding: 'var(--s-5) var(--s-8)',
            borderTop: '1px solid var(--c-line)',
            fontSize: 12,
            color: 'var(--c-ink-mute)',
          }}>
            Invoice created on {created.toLocaleDateString()}. Contact your salesperson with any questions.
          </footer>
        </div>
      </div>
    </main>
  );
}
