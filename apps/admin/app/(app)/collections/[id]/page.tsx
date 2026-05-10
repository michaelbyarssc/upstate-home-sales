import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@uhs/db/server';
import type { HomeCollection } from '@uhs/db';
import { CollectionEditor } from './collection-editor';

export const dynamic = 'force-dynamic';

export default async function CollectionDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: collection }, { data: members }, { data: homes }] = await Promise.all([
    supabase.from('home_collections').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('home_collection_members')
      .select('home_id, sort_order')
      .eq('collection_id', params.id)
      .order('sort_order'),
    supabase
      .from('homes')
      .select('id, name, stock_no, status, listed_price_cents, beds, baths, sqft')
      .is('deleted_at', null)
      .order('name'),
  ]);

  if (!collection) notFound();

  const memberIds = (members ?? []).map((m: { home_id: string }) => m.home_id);

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link href="/collections" style={{ color: 'var(--adm-ink-mute)', fontSize: 13, textDecoration: 'none' }}>
          ← Back to collections
        </Link>
      </div>

      <CollectionEditor
        collection={collection as HomeCollection}
        initialMemberIds={memberIds}
        homes={(homes ?? []) as Array<{ id: string; name: string; stock_no: string; status: string; listed_price_cents: number; beds: number | null; baths: number | null; sqft: number | null }>}
      />
    </>
  );
}
