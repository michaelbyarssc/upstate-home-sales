import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { getEsignProvider, isEsignConfigured, type EsignTemplateSummary } from '../../../../../lib/esign';
import { RegisterForm } from './register-form';

export const dynamic = 'force-dynamic';

export default async function RegisterTemplatePage() {
  if (!isEsignConfigured()) {
    return (
      <>
        <div className="page-header"><h1>Register template</h1></div>
        <div className="banner-warn">
          E-signature isn’t configured. Set <code>SIGNWELL_API_KEY</code> first.
        </div>
      </>
    );
  }

  let templates: EsignTemplateSummary[] = [];
  let loadError: string | null = null;
  try {
    templates = await getEsignProvider().listTemplates();
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Failed to load provider templates.';
  }

  // Hide templates already registered for this org.
  const supabase = createClient();
  const { data: existing } = await supabase
    .from('document_templates')
    .select('provider_template_id');
  const taken = new Set((existing ?? []).map((r) => r.provider_template_id).filter(Boolean));
  const available = templates.filter((t) => !taken.has(t.id));

  return (
    <>
      <div className="page-header">
        <div className="eyebrow">
          <Link href="/documents/templates" style={{ color: 'inherit' }}>
            ← Templates
          </Link>
        </div>
        <h1>Register template</h1>
        <p>Pick a template you built in your e-sign provider and register it here to map its fields.</p>
      </div>

      {loadError && <div className="banner-warn">Couldn’t load provider templates: {loadError}</div>}

      <RegisterForm templates={available} />
    </>
  );
}
