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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publicPhotoBaseUrl = `${url}/storage/v1/object/public/${HOME_PHOTO_BUCKET}`;

  return (
    <HomeForm
      mode="edit"
      home={home as Home}
      photos={(photos ?? []) as HomePhoto[]}
      manufacturers={(manufacturers ?? []) as Manufacturer[]}
      lots={(lots ?? []) as Lot[]}
      publicPhotoBaseUrl={publicPhotoBaseUrl}
    />
  );
}
