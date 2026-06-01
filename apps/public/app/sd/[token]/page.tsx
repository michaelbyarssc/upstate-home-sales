import Link from 'next/link';
import { createServiceClient } from '@uhs/db/service';
import { DOC_INSTANCES_BUCKET, formatCents } from '@uhs/db';

type Params = { token: string };

export const dynamic = 'force-dynamic';

/**
 * Public, token-scoped viewer for a completed signed document.
 *
 * The signed PDF (sealed + audit-stamped) is the store-back copy in OUR own
 * `doc-instances` bucket — the vendor is never the system of record. The link is
 * unguessable (random public_token), mirroring how /q and /inv share quotes and
 * invoices. We read with the service client (the instance row is not anon-readable)
 * and only ever expose a COMPLETED document.
 */
function one<T>(rel: T | T[] | null | undefined): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : (rel ?? null);
}

export async function generateMetadata({ params }: { params: Params }) {
  const svc = createServiceClient();
  const { data } = await svc
    .from('document_instances')
    .select('doc_number, status, orgs(name)')
    .eq('public_token', params.token)
    .maybeSingle();
  if (!data || data.status !== 'completed') return { title: 'Signed document' };
  const org = one(data.orgs as { name: string } | { name: string }[] | null);
  return { title: `Signed document #${data.doc_number ?? ''} · ${org?.name ?? 'Upstate Home Center'}` };
}

export default async function SignedDocPage({ params }: { params: Params }) {
  const svc = createServiceClient();
  const { data: inst } = await svc
    .from('document_instances')
    .select(
      'id, status, doc_number, signed_pdf_path, signed_pdf_sha256, listed_price_cents, completed_at, orgs(name, brand_color), document_templates(name)',
    )
    .eq('public_token', params.token)
    .maybeSingle();

  const notReady = !inst || inst.status !== 'completed' || !inst.signed_pdf_path;
  if (notReady) {
    return (
      <main style={{ padding: '120px 24px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--f-display)' }}>Document not available</h1>
        <p style={{ marginTop: 12, color: 'var(--c-ink-mute)' }}>
          This link may be invalid, or the document hasn&rsquo;t been fully signed yet. Please
          contact your salesperson.
        </p>
        <Link href="/" className="btn btn-secondary" style={{ marginTop: 24 }}>
          ← Home
        </Link>
      </main>
    );
  }

  const org = one(inst.orgs as { name: string; brand_color: string | null } | { name: string; brand_color: string | null }[] | null);
  const template = one(inst.document_templates as { name: string } | { name: string }[] | null);
  const brand = org?.brand_color ?? null;

  // Short-lived signed URL for the sealed PDF (regenerated each request).
  const { data: signed } = await svc.storage
    .from(DOC_INSTANCES_BUCKET)
    .createSignedUrl(inst.signed_pdf_path!, 600);
  const pdfUrl = signed?.signedUrl ?? null;

  const completed = inst.completed_at ? new Date(inst.completed_at) : null;

  return (
    <main className="section">
      <div className="inner section-narrow">
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--c-line)',
            borderRadius: 'var(--r-3)',
            overflow: 'hidden',
          }}
        >
          <header style={{ padding: 'var(--s-6) var(--s-8)', background: brand ?? 'var(--c-bg)', color: brand ? '#fff' : 'inherit' }}>
            <div style={{ fontSize: 13, opacity: 0.85 }}>{org?.name ?? 'Upstate Home Center'}</div>
            <h1 style={{ fontFamily: 'var(--f-display)', margin: '4px 0 0', fontSize: 26 }}>
              Signed document #{inst.doc_number ?? ''}
            </h1>
            <div style={{ fontSize: 13, marginTop: 6, opacity: 0.85, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {template?.name && <span>{template.name}</span>}
              {completed && <span>Completed {completed.toLocaleDateString()}</span>}
              {inst.listed_price_cents != null && <span>{formatCents(inst.listed_price_cents)}</span>}
            </div>
          </header>

          <div style={{ padding: 'var(--s-6) var(--s-8)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 16,
              }}
            >
              <p style={{ margin: 0, fontSize: 14, color: 'var(--c-ink-soft)' }}>
                This is the sealed, legally-signed copy with its audit trail on the final page.
              </p>
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}
                >
                  Download PDF ↓
                </a>
              )}
            </div>

            {pdfUrl ? (
              <iframe
                src={pdfUrl}
                title={`Signed document #${inst.doc_number ?? ''}`}
                style={{ width: '100%', height: '78vh', border: '1px solid var(--c-line)', borderRadius: 'var(--r-1)' }}
              />
            ) : (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-ink-mute)' }}>
                Couldn&rsquo;t load the document. Please try again or contact your salesperson.
              </div>
            )}

            {inst.signed_pdf_sha256 && (
              <p style={{ marginTop: 14, fontSize: 11, color: 'var(--c-ink-mute)', wordBreak: 'break-all' }}>
                SHA-256: {inst.signed_pdf_sha256}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
