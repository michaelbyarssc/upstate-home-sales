'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type HomeCollection } from '@uhs/db';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export async function createCollection(formData: FormData) {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org');

  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const slugInput = String(formData.get('slug') ?? '').trim() || name;
  const slug = slugify(slugInput);

  if (!name) throw new Error('Name is required');
  if (!slug) throw new Error('Slug is required');

  const { data, error } = await supabase
    .from('home_collections')
    .insert({ org_id: orgId, name, slug, description, is_published: false })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Insert failed');

  revalidatePath('/collections');
  redirect(`/collections/${data.id}`);
}

export async function updateCollection(
  id: string,
  patch: Partial<Pick<HomeCollection, 'name' | 'slug' | 'description' | 'sort_order' | 'is_published' | 'hero_storage_path'>>,
) {
  const supabase = createClient();
  const next = patch.slug ? { ...patch, slug: slugify(patch.slug) } : patch;
  const { error } = await supabase.from('home_collections').update(next).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/collections');
  revalidatePath(`/collections/${id}`);
}

export async function deleteCollection(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from('home_collections').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/collections');
}

export async function setCollectionMembers(collectionId: string, homeIds: string[]) {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org');

  // Replace-all approach: delete then insert. The set is small (dozens of homes),
  // so a transaction-style approach via two calls is fine.
  const { error: delErr } = await supabase
    .from('home_collection_members')
    .delete()
    .eq('collection_id', collectionId);
  if (delErr) throw new Error(delErr.message);

  if (homeIds.length === 0) {
    revalidatePath(`/collections/${collectionId}`);
    return;
  }

  const rows = homeIds.map((home_id, i) => ({
    collection_id: collectionId,
    home_id,
    org_id: orgId,
    sort_order: i,
  }));
  const { error: insErr } = await supabase.from('home_collection_members').insert(rows);
  if (insErr) throw new Error(insErr.message);

  revalidatePath(`/collections/${collectionId}`);
}
