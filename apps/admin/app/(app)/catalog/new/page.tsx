import { createClient } from '@uhs/db/server';
import { HOME_PHOTO_BUCKET, type Manufacturer } from '@uhs/db';
import { ModelForm } from '../model-form';
import '../../inventory/inventory.css';

export const dynamic = 'force-dynamic';

export default async function NewModelPage() {
  const supabase = createClient();
  const { data: manufacturers } = await supabase
    .from('manufacturers')
    .select('*')
    .order('name');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publicPhotoBaseUrl = `${url}/storage/v1/object/public/${HOME_PHOTO_BUCKET}`;

  return (
    <ModelForm
      mode="create"
      manufacturers={(manufacturers ?? []) as Manufacturer[]}
      publicPhotoBaseUrl={publicPhotoBaseUrl}
    />
  );
}
