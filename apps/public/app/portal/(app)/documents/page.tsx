import { createClient } from '@uhs/db/server';
import { DocumentsClient } from './documents-client';
import type { BuyerDocument } from '@uhs/db';

export const metadata = { title: 'Documents · Buyer portal' };
export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data: docs } = await sb
    .from('buyer_documents')
    .select('id, kind, original_name, size_bytes, content_type, uploaded_at, storage_path, lead_id, org_id, buyer_id')
    .eq('buyer_id', user.id)
    .order('uploaded_at', { ascending: false });

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow">Financing</div>
        <h1 style={{ marginTop: 6 }}>Documents</h1>
        <p style={{ fontSize: 'var(--t-body-l)', color: 'var(--c-ink-soft)', marginTop: 8 }}>
          Securely upload your driver&rsquo;s license, W2s, and proof of income. Files are encrypted at rest;
          only you and the salesperson on your account can access them.
        </p>
      </div>

      <DocumentsClient initialDocs={(docs ?? []) as BuyerDocument[]} userId={user.id} />
    </>
  );
}
