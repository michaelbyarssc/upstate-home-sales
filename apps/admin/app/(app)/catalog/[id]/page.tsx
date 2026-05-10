import { notFound } from 'next/navigation';
import { createClient } from '@uhs/db/server';
import { HOME_PHOTO_BUCKET, type HomeModel, type HomeModelPhoto, type Manufacturer } from '@uhs/db';
import { ModelForm } from '../model-form';
import '../../inventory/inventory.css';

export const dynamic = 'force-dynamic';

export default async function EditModelPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: model }, { data: photos }, { data: manufacturers }] = await Promise.all([
    supabase.from('home_models').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('home_model_photos')
      .select('*')
      .eq('home_model_id', params.id)
      .order('sort_order'),
    supabase.from('manufacturers').select('*').order('name'),
  ]);

  if (!model) notFound();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publicPhotoBaseUrl = `${url}/storage/v1/object/public/${HOME_PHOTO_BUCKET}`;

  return (
    <ModelForm
      mode="edit"
      model={model as HomeModel}
      photos={(photos ?? []) as HomeModelPhoto[]}
      manufacturers={(manufacturers ?? []) as Manufacturer[]}
      publicPhotoBaseUrl={publicPhotoBaseUrl}
    />
  );
}
