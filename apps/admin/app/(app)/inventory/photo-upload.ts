'use client';

import { createClient } from '@uhs/db/browser';
import { HOME_PHOTO_BUCKET, type HomePhoto } from '@uhs/db';

/**
 * Direct client→Storage upload using the user's anon JWT. Storage RLS gates
 * write permission on the bucket. After each file lands, we insert a
 * home_photos row (also RLS-gated).
 */
export async function uploadPhotos(
  homeId: string,
  orgId: string,
  files: File[],
  startSortOrder: number,
): Promise<HomePhoto[]> {
  const supabase = createClient();
  const inserted: HomePhoto[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const path = `${orgId}/${homeId}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(HOME_PHOTO_BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: '3600' });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data, error } = await supabase
      .from('home_photos')
      .insert({
        home_id: homeId,
        org_id: orgId,
        storage_path: path,
        sort_order: startSortOrder + i,
        alt_text: null,
      })
      .select('*')
      .single();
    if (error) throw new Error(`DB insert failed: ${error.message}`);
    inserted.push(data as HomePhoto);
  }

  return inserted;
}
