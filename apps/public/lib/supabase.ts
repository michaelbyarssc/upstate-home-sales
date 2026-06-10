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

/**
 * Returns the subset of the given home ids whose model has Design Studio content
 * (≥1 authored option or a 3D asset), read from the `public_home_design` view.
 *
 * Tolerant by design: if the view doesn't exist yet (migration 0046 not applied)
 * or the query errors, returns an empty set so the storefront keeps working and
 * the "Design home" CTA simply stays hidden until the data is live.
 */
export async function fetchDesignReadyIds(
  sb: ReturnType<typeof createPublicClient>,
  homeIds: string[],
): Promise<Set<string>> {
  if (homeIds.length === 0) return new Set();
  const { data, error } = await sb
    .from('public_home_design')
    .select('home_id, design_ready')
    .in('home_id', homeIds);
  if (error || !data) return new Set();
  return new Set(
    (data as Array<{ home_id: string; design_ready: boolean }>)
      .filter((r) => r.design_ready)
      .map((r) => r.home_id),
  );
}
