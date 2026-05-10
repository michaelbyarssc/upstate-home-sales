'use client';

import { createClient } from '@uhs/db/browser';
import { HOME_PHOTO_BUCKET, type HomeModelPhoto } from '@uhs/db';

/**
 * Direct client→Storage upload for home_model photos. Uses the same
 * `home-photos` bucket as live inventory; files live under
 * `{orgId}/{modelId}/...` and can be shared by stocked unit copies.
 */
export async function uploadModelPhotos(
  modelId: string,
  orgId: string,
  files: File[],
  startSortOrder: number,
): Promise<HomeModelPhoto[]> {
  const supabase = createClient();
  const inserted: HomeModelPhoto[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const path = `${orgId}/${modelId}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(HOME_PHOTO_BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: '3600' });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data, error } = await supabase
      .from('home_model_photos')
      .insert({
        home_model_id: modelId,
        org_id: orgId,
        storage_path: path,
        sort_order: startSortOrder + i,
        alt_text: null,
      })
      .select('*')
      .single();
    if (error) throw new Error(`DB insert failed: ${error.message}`);
    inserted.push(data as HomeModelPhoto);
  }

  return inserted;
}
