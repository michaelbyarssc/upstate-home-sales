'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE } from '@uhs/db';

/**
 * PR 3.2 — record a freshly-uploaded GLB asset. The browser uploads the
 * file directly to the model-3d-assets bucket via the anon client (bucket
 * policy gates on authenticated insert), then calls this action with the
 * storage path so the row in model_3d_assets goes in under RLS.
 */
export async function attachModelAsset(args: {
  homeModelId: string;
  storagePath: string;
  version: number;
  materialManifest: Record<string, string | string[]>;
  metadata: Record<string, unknown>;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) return { ok: false, error: 'No active org' };

  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('model_3d_assets')
    .insert({
      org_id: orgId,
      home_model_id: args.homeModelId,
      version: args.version,
      glb_storage_path: args.storagePath,
      material_manifest: args.materialManifest,
      metadata: args.metadata,
      uploaded_by: user?.id ?? null,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Insert failed' };

  revalidatePath(`/catalog/${args.homeModelId}/3d-asset`);
  return { ok: true, id: data.id };
}
