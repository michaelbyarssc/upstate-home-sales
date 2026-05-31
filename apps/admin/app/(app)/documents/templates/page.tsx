import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { isEsignConfigured } from '../../../../lib/esign';
import type { DocumentTemplate } from '@uhs/db';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  purchase_order: 'Purchase Order',
  purchase_agreement: 'Purchase Agreement',
  disclosure: 'Disclosure',
  addendum: 'Addendum',
  generic: 'Document',
};

export default async function TemplatesPage() {
  const supabase = createClient();
  const { data: templates, error } = await supabase
    .from('document_templates')
    .select('id, name, kind, status, provider, provider_template_id, created_at')
    .order('created_at', { ascending: false });

  const rows = (templates ?? []) as Pick<
    DocumentTemplate,
    'id' | 'name' | 'kind' | 'status' | 'provider' | 'provider_template_id' | 'created_at'
  >[];

  return (
    <>
      <div
        className="page-header"
        style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}
      >
        <div>
          <div className="eyebrow">Workspace · Documents</div>
          <h1>Templates</h1>
          <p>
            Sign-ready document templates (P.O.s, contracts, disclosures). Each maps its fields to
            your lead, home, and pricing data, then sends for signature.
          </p>
        </div>
        {isEsignConfigured() && (
          <Link
            href="/documents/templates/register"
            style={{
              background: 'var(--adm-accent)',
              color: '#fff',
              padding: '9px 14px',
              borderRadius: 6,
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: 13,
            }}
          >
            + Register template
          </Link>
        )}
      </div>

      {!isEsignConfigured() && (
        <div className="banner-warn">
          E-signature isn’t configured. Set <code>SIGNWELL_API_KEY</code> (and{' '}
          <code>ESIGN_PROVIDER=signwell</code>) to register templates.
        </div>
      )}

      {error && <div className="banner-warn">Failed to load templates: {error.message}</div>}

      {rows.length === 0 ? (
        <div
          className="card"
          style={{ padding: 32, textAlign: 'center', color: 'var(--adm-ink-mute)' }}
        >
          <p style={{ fontSize: 15, marginBottom: 6 }}>No templates yet.</p>
          <p style={{ fontSize: 13 }}>
            Build your document in {process.env.ESIGN_PROVIDER === 'signwell' ? 'SignWell' : 'your e-sign provider'},
            then register it here and map its fields.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((t) => (
            <Link
              key={t.id}
              href={`/documents/templates/${t.id}`}
              className="card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--adm-ink-mute)', marginTop: 2 }}>
                  {KIND_LABEL[t.kind] ?? t.kind} · {t.provider}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  padding: '3px 8px',
                  borderRadius: 999,
                  background:
                    t.status === 'active' ? '#e6f4ea' : t.status === 'draft' ? '#fdf3e0' : '#eee',
                  color: t.status === 'active' ? '#1d6f3f' : t.status === 'draft' ? '#9a6a1a' : '#777',
                }}
              >
                {t.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
