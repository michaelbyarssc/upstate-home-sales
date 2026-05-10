import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@uhs/db/server';
import type { HomeModel, ModelOption, ModelOptionValue } from '@uhs/db';
import { OptionsManager } from './options-manager';

export const dynamic = 'force-dynamic';

export default async function CatalogOptionsPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: model }, { data: opts }] = await Promise.all([
    supabase.from('home_models').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('model_options')
      .select('*, values:model_option_values(*)')
      .eq('home_model_id', params.id)
      .order('sort_order'),
  ]);

  if (!model) notFound();

  return (
    <>
      <div className="page-header">
        <Link href={`/catalog/${params.id}`} style={{ fontSize: 12, color: 'var(--adm-ink-mute)', textDecoration: 'none' }}>
          ← {(model as HomeModel).name}
        </Link>
        <h1 style={{ marginTop: 6 }}>Design Studio options</h1>
        <p style={{ color: 'var(--adm-ink-mute)', fontSize: 13, marginTop: 4 }}>
          Define the customizable slots and pickable values for this model.
          Slot names match GLB mesh-name keys in the asset&rsquo;s material manifest
          (see <Link href="/3d-asset-spec" style={{ color: 'var(--adm-accent)' }}>asset spec</Link>).
        </p>
      </div>
      <OptionsManager
        homeModelId={params.id}
        initialOptions={(opts ?? []) as Array<ModelOption & { values: ModelOptionValue[] }>}
      />
    </>
  );
}
