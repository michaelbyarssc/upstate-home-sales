'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import {
  ACTIVE_ORG_COOKIE,
  type DocumentTemplateKind,
  type DocFieldSource,
  type DocSignerRole,
} from '@uhs/db';

function activeOrgId(): string {
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org selected.');
  return orgId;
}

/** Register a SignWell (or other provider) template into our registry. */
export async function registerTemplate(args: {
  providerTemplateId: string;
  name: string;
  kind: DocumentTemplateKind;
}): Promise<{ id: string }> {
  const supabase = createClient();
  const orgId = activeOrgId();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('document_templates')
    .insert({
      org_id: orgId,
      name: args.name.trim() || 'Untitled template',
      kind: args.kind,
      provider: process.env.ESIGN_PROVIDER ?? 'signwell',
      provider_template_id: args.providerTemplateId,
      status: 'active',
      created_by: user?.id ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to register template.');

  revalidatePath('/documents/templates');
  return { id: data.id };
}

export type FieldMapInput = {
  provider_field_id: string;
  label: string;
  source: DocFieldSource;
  binding_key: string | null;
  signer_role: DocSignerRole | null;
  required: boolean;
};

/** Replace the full field-map for a template (delete-then-insert is simplest + atomic enough here). */
export async function saveFieldMapping(args: {
  templateId: string;
  fields: FieldMapInput[];
}): Promise<{ ok: true }> {
  const supabase = createClient();
  const orgId = activeOrgId();

  const { error: delErr } = await supabase
    .from('document_template_field_map')
    .delete()
    .eq('template_id', args.templateId);
  if (delErr) throw new Error(delErr.message);

  if (args.fields.length > 0) {
    const { error } = await supabase.from('document_template_field_map').insert(
      args.fields.map((f) => ({
        template_id: args.templateId,
        org_id: orgId,
        provider_field_id: f.provider_field_id,
        label: f.label,
        source: f.source,
        binding_key: f.source === 'binding' ? f.binding_key : null,
        signer_role: f.source === 'signer' ? f.signer_role : null,
        required: f.required,
      })),
    );
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/documents/templates/${args.templateId}`);
  return { ok: true };
}

export async function setTemplateStatus(args: {
  id: string;
  status: 'draft' | 'active' | 'archived';
}): Promise<{ ok: true }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('document_templates')
    .update({ status: args.status })
    .eq('id', args.id);
  if (error) throw new Error(error.message);
  revalidatePath('/documents/templates');
  revalidatePath(`/documents/templates/${args.id}`);
  return { ok: true };
}

export async function deleteTemplate(args: { id: string }): Promise<{ ok: true }> {
  const supabase = createClient();
  const { error } = await supabase.from('document_templates').delete().eq('id', args.id);
  if (error) throw new Error(error.message);
  revalidatePath('/documents/templates');
  return { ok: true };
}
