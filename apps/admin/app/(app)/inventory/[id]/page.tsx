import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@uhs/db/server';
import { HOME_PHOTO_BUCKET, type Home, type HomePhoto, type Lot, type Manufacturer } from '@uhs/db';
import { HomeForm } from '../home-form';
import '../inventory.css';

export default async function EditHomePage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: home }, { data: photos }, { data: manufacturers }, { data: lots }] = await Promise.all([
    supabase.from('homes').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('home_photos')
      .select('*')
      .eq('home_id', params.id)
      .order('sort_order'),
    supabase.from('manufacturers').select('*').order('name'),
    supabase.from('lots').select('*').is('deleted_at', null).order('name'),
  ]);

  if (!home) notFound();

  let modelName: string | null = null;
  if (home.model_id) {
    const { data: m } = await supabase
      .from('home_models')
      .select('name')
      .eq('id', home.model_id)
      .maybeSingle();
    modelName = m?.name ?? null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publicPhotoBaseUrl = `${url}/storage/v1/object/public/${HOME_PHOTO_BUCKET}`;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        {home.model_id && modelName ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: '#FAF4EB', border: '1px solid #d8c9b5',
            padding: '6px 12px', borderRadius: 4, fontSize: 12,
            color: 'var(--adm-ink-mute)',
          }}>
            <span>From catalog:</span>
            <Link href={`/catalog/${home.model_id}`} style={{ color: 'var(--adm-accent)', fontWeight: 500, textDecoration: 'none' }}>
              {modelName}
            </Link>
          </div>
        ) : <span />}
        <Link
          href={`/inventory/${home.id}/place`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#fff', border: '1px solid var(--adm-accent)',
            color: 'var(--adm-accent)', padding: '6px 12px', borderRadius: 4,
            fontSize: 12, fontWeight: 500, textDecoration: 'none',
          }}
        >
          Place on lot →
        </Link>
      </div>
      <HomeForm
        mode="edit"
        home={home as Home}
        photos={(photos ?? []) as HomePhoto[]}
        manufacturers={(manufacturers ?? []) as Manufacturer[]}
        lots={(lots ?? []) as Lot[]}
        publicPhotoBaseUrl={publicPhotoBaseUrl}
      />
    </>
  );
}
