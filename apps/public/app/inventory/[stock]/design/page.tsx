import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createPublicClient } from '../../../../lib/supabase';
import type { Home, ModelOption, ModelOptionValue, Model3dAsset } from '@uhs/db';
import { DesignStudio } from './design-studio';
import './design.css';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export default async function DesignPage({ params }: { params: { stock: string } }) {
  const sb = createPublicClient();
  // Look up the home + model + options + values + asset.
  const { data: homeRaw } = await sb
    .from('public_homes')
    .select('id, org_id, name, stock_no, beds, baths, sqft, type, listed_price_cents, prices_hidden')
    .eq('stock_no', decodeURIComponent(params.stock))
    .maybeSingle();
  if (!homeRaw) notFound();
  const home = homeRaw as Pick<Home, 'id' | 'org_id' | 'name' | 'stock_no' | 'beds' | 'baths' | 'sqft' | 'type' | 'listed_price_cents'> & { prices_hidden: boolean };

  // Look up the home's model. We use server-side data (a richer query),
  // but for the public surface we only need the model_id + asset.
  const { data: homeModelRow } = await sb
    .from('homes')
    .select('model_id')
    .eq('id', home.id)
    .maybeSingle();
  const modelId = (homeModelRow as { model_id: string | null } | null)?.model_id ?? null;

  // Without a linked model, the studio still renders with a placeholder geometry
  // and an empty option list — useful for the dealer demo / showroom kiosk.
  let asset: Model3dAsset | null = null;
  let options: Array<ModelOption & { values: ModelOptionValue[] }> = [];

  if (modelId) {
    // Latest asset for this model.
    const { data: a } = await sb
      .from('model_3d_assets')
      .select('*')
      .eq('home_model_id', modelId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    asset = (a as Model3dAsset | null) ?? null;

    // Options + values for this model.
    const { data: opts } = await sb
      .from('model_options')
      .select('*, values:model_option_values(*)')
      .eq('home_model_id', modelId)
      .order('sort_order');
    options = (opts ?? []) as unknown as Array<ModelOption & { values: ModelOptionValue[] }>;
  }

  // Resolve a signed URL for the GLB if we have an asset; for v1 we render
  // a placeholder cube with material swap when no asset exists.
  let glbUrl: string | null = null;
  if (asset) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    // Public bucket → directly construct URL. Asset bucket is private though,
    // so for v1 we pass the path through and let the renderer fetch via a
    // proxy route in a follow-up. Until then: attempt direct path which will
    // 404 silently — the renderer falls back to placeholder geometry.
    glbUrl = `${url}/storage/v1/object/public/model-3d-assets/${asset.glb_storage_path}`;
  }

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
        glbUrl={glbUrl}
        materialManifest={asset?.material_manifest ?? {}}
        options={options}
      />
    </main>
  );
}
