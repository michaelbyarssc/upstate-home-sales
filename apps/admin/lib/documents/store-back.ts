import crypto from 'node:crypto';
import { createServiceClient } from '@uhs/db/service';
import { DOC_INSTANCES_BUCKET, type DocSignerRole } from '@uhs/db';
import { getEsignProvider } from '../esign';
import { dispatchWorkflowEvent } from '../workflows';

/**
 * The store-back guarantee: pull a completed e-sign envelope's sealed PDF +
 * audit trail back into our own storage and mark the instance completed.
 *
 * Crucially, this NEVER trusts the trigger (webhook payload) — it re-fetches the
 * authoritative status from the provider with our API key, so a spoofed webhook
 * can't make us store a fake document. Idempotent: safe to call repeatedly from
 * both the webhook and the reconciliation cron.
 */
export async function storeBackIfCompleted(
  envelopeId: string,
): Promise<{ stored: boolean; reason?: string }> {
  if (!envelopeId) return { stored: false, reason: 'no envelope id' };
  const svc = createServiceClient();

  const { data: instance } = await svc
    .from('document_instances')
    .select('id, org_id, lead_id, template_id, status, doc_number')
    .eq('provider_envelope_id', envelopeId)
    .maybeSingle();
  if (!instance) return { stored: false, reason: 'no matching instance' };
  if (instance.status === 'completed') return { stored: false, reason: 'already completed' };

  const provider = getEsignProvider();
  const details = await provider.getEnvelopeDetails(envelopeId);

  if (details.status === 'declined' || details.status === 'voided') {
    await svc.from('document_instances').update({ status: details.status }).eq('id', instance.id);
    return { stored: false, reason: details.status };
  }
  if (details.status !== 'completed') return { stored: false, reason: `status=${details.status}` };

  // Download the sealed PDF (SignWell appends its audit page) and store it.
  const pdf = await provider.downloadSignedPdf(envelopeId);
  const path = `${instance.org_id}/${instance.id}/signed.pdf`;
  const { error: upErr } = await svc.storage
    .from(DOC_INSTANCES_BUCKET)
    .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error(`store signed PDF: ${upErr.message}`);
  const sha256 = crypto.createHash('sha256').update(pdf).digest('hex');

  await svc
    .from('document_instances')
    .update({
      status: 'completed',
      signed_pdf_path: path,
      signed_pdf_sha256: sha256,
      completed_at: new Date().toISOString(),
    })
    .eq('id', instance.id);

  // Record per-signer metadata, mapping the provider placeholder → our role.
  const { data: mapRows } = await svc
    .from('document_template_field_map')
    .select('provider_field_id, signer_role')
    .eq('template_id', instance.template_id)
    .eq('source', 'signer');
  const roleByPlaceholder = new Map<string, DocSignerRole>();
  for (const r of (mapRows ?? []) as Array<{ provider_field_id: string; signer_role: DocSignerRole | null }>) {
    if (r.signer_role) roleByPlaceholder.set(r.provider_field_id, r.signer_role);
  }
  for (const s of details.signers) {
    if (!s.completed) continue;
    const role = s.placeholderName ? roleByPlaceholder.get(s.placeholderName) : undefined;
    if (!role) continue;
    await svc.from('document_signatures').upsert(
      {
        instance_id: instance.id,
        org_id: instance.org_id,
        signer_role: role,
        signer_name: s.name || role,
        signer_email: s.email,
        signed_at: s.signedAt ?? new Date().toISOString(),
      },
      { onConflict: 'instance_id,signer_role' },
    );
  }

  // Close any open signing session.
  await svc
    .from('signing_sessions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('instance_id', instance.id)
    .neq('status', 'completed');

  // Lead timeline + workflow event.
  await svc.from('lead_messages').insert({
    lead_id: instance.lead_id,
    org_id: instance.org_id,
    kind: 'system',
    channel: null,
    body: `Document #${instance.doc_number ?? ''} signed by all parties — sealed copy stored.`,
  });
  await dispatchWorkflowEvent({
    event: 'document.completed',
    orgId: instance.org_id,
    payload: { instance_id: instance.id, lead_id: instance.lead_id, doc_number: instance.doc_number },
  }).catch((e) => console.error('[store-back] workflow dispatch failed:', e));

  return { stored: true };
}
