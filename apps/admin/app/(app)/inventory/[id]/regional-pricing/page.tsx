import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@uhs/db/server';
import { formatCents, type Home, type HomeRegionPricing } from '@uhs/db';
import { RegionalPricingManager } from './regional-pricing-manager';

export const dynamic = 'force-dynamic';

export default async function RegionalPricingPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: home }, { data: prices }] = await Promise.all([
    supabase.from('homes').select('id, org_id, name, stock_no, listed_price_cents, prices_hidden:org_id').eq('id', params.id).maybeSingle(),
    supabase
      .from('home_region_pricing')
      .select('*')
      .eq('home_id', params.id)
      .order('region_type')
      .order('region_value'),
  ]);

  if (!home) notFound();

  const h = home as Pick<Home, 'id' | 'org_id' | 'name' | 'stock_no' | 'listed_price_cents'>;

  return (
    <>
      <div className="page-header">
        <Link href={`/inventory/${h.id}`} style={{ fontSize: 12, color: 'var(--adm-ink-mute)', textDecoration: 'none' }}>
          ← {h.name} ({h.stock_no})
        </Link>
        <h1 style={{ marginTop: 6 }}>Regional pricing</h1>
        <p style={{ color: 'var(--adm-ink-mute)', fontSize: 13, marginTop: 4 }}>
          Override the listed price ({formatCents(h.listed_price_cents)}) for buyers in specific zips, counties, or states.
          Most-specific match wins (zip &gt; county &gt; state).
        </p>
      </div>
      <RegionalPricingManager
        homeId={h.id}
        baseListedPriceCents={h.listed_price_cents}
        initial={(prices ?? []) as HomeRegionPricing[]}
      />
    </>
  );
}
