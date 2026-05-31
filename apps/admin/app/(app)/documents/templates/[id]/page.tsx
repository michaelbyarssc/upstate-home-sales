import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@uhs/db/server';
import { getEsignProvider, isEsignConfigured, type EsignTemplateField } from '../../../../../lib/esign';
import type { DocumentTemplate, DocumentTemplateFieldMap } from '@uhs/db';
import { MappingForm } from './mapping-form';

export const dynamic = 'force-dynamic';

export default async function TemplateDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: tpl } = await supabase
    .from('document_templates')
    .select('id, name, kind, status, provider, provider_template_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!tpl) notFound();
  const template = tpl as Pick<
    DocumentTemplate,
    'id' | 'name' | 'kind' | 'status' | 'provider' | 'provider_template_id'
  >;

  const { data: mapRows } = await supabase
    .from('document_template_field_map')
    .select('provider_field_id, label, source, binding_key, signer_role, required')
    .eq('template_id', params.id);
  const existing = (mapRows ?? []) as Pick<
    DocumentTemplateFieldMap,
    'provider_field_id' | 'label' | 'source' | 'binding_key' | 'signer_role' | 'required'
  >[];

  let providerFields: EsignTemplateField[] = [];
  let placeholders: string[] = [];
  let providerStatus = '';
  let loadError: string | null = null;
  if (isEsignConfigured() && template.provider_template_id) {
    try {
      const res = await getEsignProvider().getTemplateFields(template.provider_template_id);
      providerFields = res.fields;
      placeholders = res.placeholders;
      providerStatus = res.status;
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Failed to load template fields.';
    }
  }

  const isSignatureType = (t: string) => t === 'signature' || t === 'initials';
  const dataFields = providerFields.filter((f) => !isSignatureType(f.type) && f.apiId);

  return (
    <>
      <div className="page-header">
        <div className="eyebrow">
          <Link href="/documents/templates" style={{ color: 'inherit' }}>
            ← Templates
          </Link>
        </div>
        <h1>{template.name}</h1>
        <p>
          Map this template’s fields to your data, then it’s ready to generate + send for signature.
          {providerStatus && providerStatus.toLowerCase() !== 'available' && (
            <strong style={{ color: '#9a6a1a' }}> · Provider status: {providerStatus}</strong>
          )}
        </p>
      </div>

      {loadError && <div className="banner-warn">Couldn’t load fields from the provider: {loadError}</div>}

      <MappingForm
        templateId={template.id}
        placeholders={placeholders}
        dataFields={dataFields}
        existing={existing}
      />
    </>
  );
}
