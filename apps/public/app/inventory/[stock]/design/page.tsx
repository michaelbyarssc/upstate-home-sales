import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createPublicClient, publicPhotoUrl } from '../../../../lib/supabase';
import type { Home, ModelOption, ModelOptionValue } from '@uhs/db';
import { DesignStudio } from './design-studio';
import './design.css';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export default async function DesignPage({ params }: { params: { stock: string } }) {
  const sb = createPublicClient();
  const stock = decodeURIComponent(params.stock);
  // Look up the home's display fields from public_homes (anon-safe; no model_id).
  const { data: homeRaw } = await sb
    .from('public_homes')
    .select('id, org_id, name, stock_no, beds, baths, sqft, type, listed_price_cents, prices_hidden')
    .eq('stock_no', stock)
    .maybeSingle();
  if (!homeRaw) notFound();
  const home = homeRaw as Pick<Home, 'id' | 'org_id' | 'name' | 'stock_no' | 'beds' | 'baths' | 'sqft' | 'type' | 'listed_price_cents'> & { prices_hidden: boolean };

  // model_id rides on the public_home_design view (0046) — anon can't read the
  // homes table directly. If the view is missing (migration not yet applied) or
  // there's no model, we bounce to the detail page via the guard below.
  const { data: designRow } = await sb
    .from('public_home_design')
    .select('model_id')
    .eq('home_id', home.id)
    .maybeSingle();
  const modelId = (designRow as { model_id: string | null } | null)?.model_id ?? null;

  // Options + values for this model — the studio's whole content.
  let options: Array<ModelOption & { values: ModelOptionValue[] }> = [];
  if (modelId) {
    const { data: opts } = await sb
      .from('model_options')
      .select('*, values:model_option_values(*)')
      .eq('home_model_id', modelId)
      .order('sort_order');
    options = (opts ?? []) as unknown as Array<ModelOption & { values: ModelOptionValue[] }>;
  }

  // Studio has nothing to configure (no model, or no authored options).
  // Public cards only link here when design_ready, so this guards direct-URL
  // hits — bounce back to the detail page rather than show an empty configurator.
  if (!modelId || options.length === 0) {
    redirect(`/inventory/${encodeURIComponent(home.stock_no)}`);
  }

  // Primary photo for the preview inset.
  const { data: heroPhoto } = await sb
    .from('public_home_photos')
    .select('storage_path')
    .eq('home_id', home.id)
    .order('sort_order')
    .limit(1)
    .maybeSingle();
  const heroPhotoUrl = heroPhoto?.storage_path ? publicPhotoUrl(heroPhoto.storage_path) : null;

  return (
    <main className="design-shell">
      <header className="design-topbar">
        <Link href={`/inventory/${encodeURIComponent(home.stock_no)}`} style={{ color: 'var(--c-ink-mute)', fontSize: 13, textDecoration: 'none' }}>
          ← {home.name} ({home.stock_no})
        </Link>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: 'var(--c-ink-mute)' }}>Design Studio</div>
      </header>
      <DesignStudio
        homeId={home.id}
        homeName={home.name}
        baseListedPriceCents={home.listed_price_cents}
        pricesHidden={home.prices_hidden}
        options={options}
        heroPhotoUrl={heroPhotoUrl}
      />
    </main>
  );
}
