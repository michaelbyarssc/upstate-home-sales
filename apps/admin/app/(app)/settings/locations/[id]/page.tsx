import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@uhs/db/server';
import type { Location } from '@uhs/db';
import { LocationEditor } from './location-editor';

export const dynamic = 'force-dynamic';

export default async function LocationEditPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from('locations')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (!data) notFound();

  return (
    <>
      <div className="page-header">
        <Link href="/settings/locations" style={{ fontSize: 12, color: 'var(--adm-ink-mute)', textDecoration: 'none' }}>
          ← All locations
        </Link>
        <h1 style={{ marginTop: 6 }}>{(data as Location).name}</h1>
      </div>
      <LocationEditor initial={data as Location} />
    </>
  );
}
