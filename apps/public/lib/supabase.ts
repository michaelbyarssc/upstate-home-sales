import { createClient as createJsClient } from '@supabase/supabase-js';
import { HOME_PHOTO_BUCKET } from '@uhs/db';

/**
 * Anon-only client for the public site. Reads public_homes / public_home_photos.
 * Never touches the homes table — RLS would block it anyway.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createJsClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  });
}

export function publicPhotoUrl(storagePath: string): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${url}/storage/v1/object/public/${HOME_PHOTO_BUCKET}/${storagePath}`;
}
