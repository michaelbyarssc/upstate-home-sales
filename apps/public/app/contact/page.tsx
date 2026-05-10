import Link from 'next/link';
import { createPublicClient } from '../../lib/supabase';
import { formatCents, type PublicHomeDesign, type PublicHomeDesignSelection } from '@uhs/db';
import { ContactForm } from './contact-form';

export const metadata = { title: 'Contact' };
export const dynamic = 'force-dynamic';

type SearchParams = { design?: string | string[] };

type DesignContext = {
  designId: string;
  shareToken: string;
  homeId: string;
  homeName: string;
  stockNo: string;
  totalPriceCents: number;
  pricesHidden: boolean;
  selections: PublicHomeDesignSelection[];
};

async function loadDesignContext(token: string): Promise<DesignContext | null> {
  const sb = createPublicClient();
  const [{ data: design }, { data: selections }] = await Promise.all([
    sb.from('public_home_designs').select('*').eq('share_token', token).maybeSingle(),
    sb.from('public_home_design_selections').select('*').eq('share_token', token),
  ]);
  if (!design) return null;
  const d = design as PublicHomeDesign;

  // Resolve the underlying design.id from the share_token so the lead can be
  // linked back to home_designs.id (not just the token). The public view
  // intentionally hides this; we read it server-side with the anon key — the
  // RLS policy on home_designs allows authenticated buyer-self reads, but the
  // share_token itself is a capability so we can grant a narrow lookup via the
  // public view's home_id + a follow-up fetch keyed on token.
  const { data: designIdRow } = await sb
    .from('home_designs')
    .select('id')
    .eq('share_token', token)
    .maybeSingle();

  return {
    designId: designIdRow?.id ?? '',
    shareToken: d.share_token,
    homeId: d.home_id,
    homeName: d.home_name,
    stockNo: d.home_stock_no,
    totalPriceCents: d.total_price_cents,
    pricesHidden: d.design_price_display === 'hidden',
    selections: (selections ?? []) as PublicHomeDesignSelection[],
  };
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { design: designToken } = await searchParams;
  const token = Array.isArray(designToken) ? designToken[0] : designToken;
  const designContext = token ? await loadDesignContext(token) : null;

  return (
    <main className="section">
      <div className="inner" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-12)' }}>
        <div>
          <div className="eyebrow">Contact</div>
          <h1 style={{ marginTop: 'var(--s-3)' }}>Drop us a line.</h1>
          <p style={{ fontSize: 'var(--t-body-l)', marginTop: 'var(--s-4)', color: 'var(--c-ink-soft)' }}>
            Questions about a specific home, a trade-in, or whether we deliver to your county? We&rsquo;ll
            usually answer within a business day. For anything urgent, call us.
          </p>

          <div style={{ marginTop: 'var(--s-8)' }}>
            <h3 style={{ marginBottom: 'var(--s-2)' }}>Phone</h3>
            <p><a href="tel:864-680-4030" style={{ fontSize: 'var(--t-body-l)' }}>(864) 680-4030</a></p>

            <h3 style={{ marginTop: 'var(--s-6)', marginBottom: 'var(--s-2)' }}>Email</h3>
            <p><a href="mailto:hello@upstatehomecenter.com" style={{ fontSize: 'var(--t-body-l)' }}>hello@upstatehomecenter.com</a></p>

            <h3 style={{ marginTop: 'var(--s-6)', marginBottom: 'var(--s-2)' }}>Lot</h3>
            <p>Spartanburg, SC</p>
          </div>

          {designContext && (
            <aside
              style={{
                marginTop: 'var(--s-8)',
                padding: 'var(--s-5)',
                border: '1px solid var(--c-line)',
                borderRadius: 'var(--r-3)',
                background: '#fff',
              }}
            >
              <div className="eyebrow">Your design</div>
              <h3 style={{ marginTop: 4 }}>{designContext.homeName}</h3>
              <p style={{ color: 'var(--c-ink-mute)', fontSize: 13, marginTop: 4 }}>
                Stock #{designContext.stockNo}
              </p>
              {!designContext.pricesHidden && (
                <p style={{ marginTop: 8, fontWeight: 600 }}>{formatCents(designContext.totalPriceCents)}</p>
              )}
              {designContext.selections.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 4, fontSize: 13 }}>
                  {designContext.selections.map((s) => (
                    <li key={`${s.option_id}-${s.value_id}`} style={{ color: 'var(--c-ink-soft)' }}>
                      <strong>{s.option_label}:</strong> {s.value_label}
                    </li>
                  ))}
                </ul>
              )}
              <p style={{ marginTop: 12, fontSize: 12, color: 'var(--c-ink-mute)' }}>
                We&rsquo;ll attach this design to your quote so we&rsquo;re working from the same selections.{' '}
                <Link href={`/d/${designContext.shareToken}`} style={{ textDecoration: 'underline' }}>
                  View design
                </Link>
              </p>
            </aside>
          )}
        </div>

        <ContactForm
          initialDesign={designContext ? {
            designId: designContext.designId,
            homeId: designContext.homeId,
            homeName: designContext.homeName,
            stockNo: designContext.stockNo,
            selectionSummary: designContext.selections
              .map((s) => `${s.option_label}: ${s.value_label}`)
              .join('\n'),
          } : null}
        />
      </div>
    </main>
  );
}
