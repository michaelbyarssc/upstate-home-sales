import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@uhs/db/server';
import { ImportForm } from './import-form';

export const dynamic = 'force-dynamic';

export default async function CatalogImportPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/catalog/import');

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div className="eyebrow">Workspace · Catalog</div>
          <h1>Import from URL</h1>
          <p>Paste a manufacturer listing URL — we&apos;ll discover the models, then you confirm to import them into your catalog.</p>
        </div>
        <Link
          href="/catalog"
          style={{
            color: 'var(--adm-ink-mute)',
            textDecoration: 'none',
            fontSize: 13,
          }}
        >
          ← Back to catalog
        </Link>
      </div>

      <ImportForm />
    </>
  );
}
