import { createClient } from '@uhs/db/server';
import { HOME_PHOTO_BUCKET, type Lot, type Manufacturer } from '@uhs/db';
import { HomeForm } from '../home-form';
import '../inventory.css';

export default async function NewHomePage() {
  const supabase = createClient();

  const [{ data: manufacturers }, { data: lots }] = await Promise.all([
    supabase.from('manufacturers').select('*').order('name'),
    supabase.from('lots').select('*').is('deleted_at', null).order('name'),
  ]);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publicPhotoBaseUrl = `${url}/storage/v1/object/public/${HOME_PHOTO_BUCKET}`;

  return (
    <HomeForm
      mode="create"
      manufacturers={(manufacturers ?? []) as Manufacturer[]}
      lots={(lots ?? []) as Lot[]}
      publicPhotoBaseUrl={publicPhotoBaseUrl}
    />
  );
}
