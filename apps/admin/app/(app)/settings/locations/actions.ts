'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type Location, type LocationHours } from '@uhs/db';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function createLocation(args: {
  name: string;
  slug?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
}): Promise<Location> {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org selected');

  const name = args.name.trim();
  if (!name) throw new Error('Name is required');
  const slug = (args.slug?.trim() ? slugify(args.slug) : slugify(name)) || 'location';

  const { data, error } = await supabase
    .from('locations')
    .insert({
      org_id: orgId,
      slug,
      name,
      address: args.address?.trim() || null,
      city: args.city?.trim() || null,
      state: args.state?.trim().toUpperCase() || null,
      zip: args.zip?.trim() || null,
      phone: args.phone?.trim() || null,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Insert failed');

  revalidatePath('/settings');
  revalidatePath('/settings/locations');
  return data as Location;
}

export async function updateLocation(
  id: string,
  patch: Partial<Pick<Location,
    'name' | 'slug' | 'address' | 'city' | 'state' | 'zip' | 'phone' |
    'brand_color' | 'logo_storage_path' | 'lat' | 'lng'
  >> & { hours_jsonb?: LocationHours | null },
): Promise<void> {
  const supabase = createClient();
  // Normalize a couple fields server-side.
  const cleaned: Record<string, unknown> = { ...patch };
  if (typeof patch.slug === 'string') cleaned.slug = slugify(patch.slug) || patch.slug;
  if (typeof patch.state === 'string') cleaned.state = patch.state.toUpperCase().slice(0, 2);

  const { error } = await supabase.from('locations').update(cleaned).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/settings');
  revalidatePath('/settings/locations');
  revalidatePath(`/settings/locations/${id}`);
}

/** Promote a location to the org's default. Demotes any current default
 *  in the same org first (because of the partial unique index). */
export async function setDefaultLocation(id: string): Promise<void> {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org');

  // Demote any current default in this org.
  const { error: e1 } = await supabase
    .from('locations')
    .update({ is_default: false })
    .eq('org_id', orgId)
    .eq('is_default', true)
    .is('deleted_at', null);
  if (e1) throw new Error(e1.message);

  const { error: e2 } = await supabase
    .from('locations')
    .update({ is_default: true })
    .eq('id', id);
  if (e2) throw new Error(e2.message);

  revalidatePath('/settings');
  revalidatePath('/settings/locations');
}

export async function archiveLocation(id: string): Promise<void> {
  const supabase = createClient();
  // Don't archive the only default — surface a clearer error.
  const { data: loc } = await supabase
    .from('locations')
    .select('is_default, org_id')
    .eq('id', id)
    .maybeSingle();
  if (loc?.is_default) {
    const { count } = await supabase
      .from('locations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', loc.org_id)
      .is('deleted_at', null);
    if ((count ?? 0) <= 1) {
      throw new Error('Cannot archive the only location. Create another one first.');
    }
    throw new Error('Cannot archive the default location. Promote a different location to default first.');
  }

  const { error } = await supabase
    .from('locations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/settings');
  revalidatePath('/settings/locations');
}
