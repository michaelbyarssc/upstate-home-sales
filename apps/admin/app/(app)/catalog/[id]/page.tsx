import Link from 'next/link';
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
  const isArchived = model.deleted_at !== null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publicPhotoBaseUrl = `${url}/storage/v1/object/public/${HOME_PHOTO_BUCKET}`;

  return (
    <>
      {!isArchived && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, gap: 8 }}>
          <Link
            href={`/catalog/${params.id}/3d-asset`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#fff', border: '1px solid var(--adm-accent)',
              color: 'var(--adm-accent)', padding: '6px 12px', borderRadius: 4,
              fontSize: 12, fontWeight: 500, textDecoration: 'none',
            }}
          >
            3D asset →
          </Link>
          <Link
            href={`/catalog/${params.id}/options`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#fff', border: '1px solid var(--adm-accent)',
              color: 'var(--adm-accent)', padding: '6px 12px', borderRadius: 4,
              fontSize: 12, fontWeight: 500, textDecoration: 'none',
            }}
          >
            Design Studio options →
          </Link>
        </div>
      )}
      <ModelForm
        mode="edit"
        model={model as HomeModel}
        photos={(photos ?? []) as HomeModelPhoto[]}
        manufacturers={(manufacturers ?? []) as Manufacturer[]}
        publicPhotoBaseUrl={publicPhotoBaseUrl}
        isArchived={isArchived}
      />
    </>
  );
}
