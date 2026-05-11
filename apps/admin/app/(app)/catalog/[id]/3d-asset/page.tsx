import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@uhs/db/server';
import type { HomeModel, Model3dAsset, ModelOption } from '@uhs/db';
import { AssetUploadForm } from './asset-upload-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: '3D asset · Catalog' };

export default async function CatalogAssetPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: model }, { data: assets }, { data: options }] = await Promise.all([
    supabase.from('home_models').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('model_3d_assets')
      .select('*')
      .eq('home_model_id', params.id)
      .order('version', { ascending: false })
      .limit(20),
    supabase
      .from('model_options')
      .select('id, slot_name, label, category')
      .eq('home_model_id', params.id)
      .order('sort_order'),
  ]);

  if (!model) notFound();

  const m = model as HomeModel;
  const assetList = (assets ?? []) as Model3dAsset[];
  const current = assetList[0] ?? null;
  const slotNames = ((options ?? []) as Pick<ModelOption, 'slot_name' | 'label'>[]).map((o) => o.slot_name);

  return (
    <>
      <div className="page-header">
        <Link href={`/catalog/${params.id}`} style={{ fontSize: 12, color: 'var(--adm-ink-mute)', textDecoration: 'none' }}>
          ← {m.name}
        </Link>
        <h1 style={{ marginTop: 6 }}>3D asset</h1>
        <p style={{ color: 'var(--adm-ink-mute)', fontSize: 13, marginTop: 4 }}>
          Upload a GLB / GLTF for the Design Studio renderer. New uploads bump the version — older versions
          stay in the bucket for rollback. Mesh names you assign here power the per-slot material swaps the
          buyer sees while configuring.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 360px) 1fr',
          gap: 24,
          alignItems: 'flex-start',
        }}
      >
        <section
          style={{
            padding: 20,
            background: '#fff',
            border: '1px solid var(--adm-line)',
            borderRadius: 8,
          }}
        >
          <h3 style={{ marginBottom: 6, font: '600 14px/1 var(--f-body)' }}>Current asset</h3>
          {current ? (
            <>
              <div style={{ fontSize: 13, color: 'var(--adm-ink-mute)' }}>
                Version {current.version} · uploaded {new Date(current.uploaded_at).toLocaleDateString()}
              </div>
              <pre
                style={{
                  marginTop: 12,
                  padding: 10,
                  background: 'var(--adm-bg)',
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {current.glb_storage_path}
              </pre>
              <div style={{ marginTop: 12 }}>
                <strong style={{ fontSize: 12 }}>Material manifest</strong>
                <pre
                  style={{
                    marginTop: 6,
                    padding: 10,
                    background: 'var(--adm-bg)',
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    overflowX: 'auto',
                  }}
                >
                  {JSON.stringify(current.material_manifest, null, 2)}
                </pre>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--adm-ink-mute)' }}>
              No asset uploaded. The Design Studio falls back to placeholder geometry.
            </div>
          )}

          {assetList.length > 1 && (
            <div style={{ marginTop: 18 }}>
              <strong style={{ fontSize: 12 }}>Older versions ({assetList.length - 1})</strong>
              <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', fontSize: 11, color: 'var(--adm-ink-mute)' }}>
                {assetList.slice(1).map((a) => (
                  <li key={a.id}>v{a.version} · {new Date(a.uploaded_at).toLocaleDateString()}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <AssetUploadForm
          homeModelId={m.id}
          orgId={m.org_id}
          nextVersion={(current?.version ?? 0) + 1}
          knownSlots={slotNames}
          existingManifest={current?.material_manifest ?? {}}
        />
      </div>

      <p style={{ marginTop: 20, fontSize: 12, color: 'var(--adm-ink-mute)' }}>
        See <Link href="/3d-asset-spec" style={{ color: 'var(--adm-accent)' }}>the asset spec</Link> for naming conventions.
        Slots configured here must match{' '}
        <Link href={`/catalog/${m.id}/options`} style={{ color: 'var(--adm-accent)' }}>
          Design Studio options
        </Link>{' '}
        for the renderer to pick up swatches.
      </p>
    </>
  );
}
