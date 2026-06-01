'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { createServiceClient } from '@uhs/db/service';
import { ACTIVE_ORG_COOKIE, type DocSignerRole } from '@uhs/db';
import { getEsignProvider, type EsignRecipientInput } from '../../../lib/esign';
import {
  resolveBinding,
  isBindingKey,
  type BindingContext,
  type BindingKey,
} from '../../../lib/documents/bindings';

const NOREPLY = 'noreply.upstatehomecenter.com';

/** Default signer name/email per role (embedded in-person signing — emails are labels only). */
function recipientIdentity(
  role: DocSignerRole,
  ctx: { leadName: string | null; leadEmail: string | null; orgName: string | null },
  leadId: string,
): { name: string; email: string } {
  switch (role) {
    case 'buyer':
      return { name: ctx.leadName || 'Buyer', email: ctx.leadEmail || `buyer+${leadId}@${NOREPLY}` };
    case 'co_buyer':
      return { name: 'Co-buyer', email: `cobuyer+${leadId}@${NOREPLY}` };
    case 'seller':
      return { name: ctx.orgName || 'Seller', email: `seller+${leadId}@${NOREPLY}` };
    case 'witness':
      return { name: 'Witness', email: `witness+${leadId}@${NOREPLY}` };
  }
}

/** Order signers buyer → co_buyer → seller → witness for sequential in-person signing. */
const ROLE_ORDER: DocSignerRole[] = ['buyer', 'co_buyer', 'seller', 'witness'];

/**
 * Generate a document instance from a template for a lead, snapshot its values,
 * create the SignWell envelope (embedded), and open an in-person signing session.
 * Returns the kiosk session token for /sign/[token].
 */
export async function generateAndStartSigning(args: {
  leadId: string;
  templateId: string;
  /** 'in_person' (default) embeds signing on the tablet; 'remote' has SignWell email the signers. */
  mode?: 'in_person' | 'remote';
}): Promise<
  | { ok: true; sessionToken: string; instanceId: string; mode: 'in_person' | 'remote' }
  | { ok: false; error: string }
> {
  const mode: 'in_person' | 'remote' = args.mode === 'remote' ? 'remote' : 'in_person';
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) return { ok: false, error: 'No active org.' };

  // ── Load template + field map ───────────────────────────────────────────
  const [{ data: template }, { data: mapRows }] = await Promise.all([
    supabase
      .from('document_templates')
      .select('id, provider_template_id, status')
      .eq('id', args.templateId)
      .maybeSingle(),
    supabase
      .from('document_template_field_map')
      .select('provider_field_id, source, binding_key, signer_role')
      .eq('template_id', args.templateId),
  ]);
  if (!template?.provider_template_id) return { ok: false, error: 'Template not found or not linked.' };
  const fieldMap = (mapRows ?? []) as {
    provider_field_id: string;
    source: 'binding' | 'manual' | 'signer';
    binding_key: string | null;
    signer_role: DocSignerRole | null;
  }[];

  // ── Load binding context (lead, home, buyer, trade-in, quote, org) ──────
  const { data: lead } = await supabase
    .from('leads')
    .select('id, org_id, contact_name, email, phone, home_id')
    .eq('id', args.leadId)
    .maybeSingle();
  if (!lead) return { ok: false, error: 'Lead not found.' };

  const [{ data: home }, { data: buyerLink }, { data: tradeIn }, { data: quote }, { data: org }] =
    await Promise.all([
      lead.home_id
        ? supabase
            .from('homes')
            .select(
              'name, stock_no, model, year_built, beds, baths, width_ft, length_ft, sqft, listed_price_cents, manufacturers(name)',
            )
            .eq('id', lead.home_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('buyer_lead_links')
        .select('buyers(full_name, email, phone)')
        .eq('lead_id', args.leadId)
        .eq('status', 'active')
        .maybeSingle(),
      supabase
        .from('trade_ins')
        .select('year, make, model, offer_cents')
        .eq('lead_id', args.leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('quotes')
        .select('listed_price_cents')
        .eq('lead_id', args.leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('orgs').select('name').eq('id', orgId).maybeSingle(),
    ]);

  const mfr = (home as { manufacturers?: { name: string } | { name: string }[] | null } | null)?.manufacturers;
  const buyerRel = (buyerLink as { buyers?: { full_name: string; email: string; phone: string | null } | { full_name: string; email: string; phone: string | null }[] | null } | null)?.buyers;
  const buyer = Array.isArray(buyerRel) ? buyerRel[0] : buyerRel;

  const ctx: BindingContext = {
    lead: { contact_name: lead.contact_name, email: lead.email, phone: lead.phone },
    buyer: buyer ? { full_name: buyer.full_name, email: buyer.email, phone: buyer.phone } : null,
    home: home
      ? {
          name: home.name,
          stock_no: home.stock_no,
          model: home.model,
          year_built: home.year_built,
          beds: home.beds,
          baths: home.baths,
          width_ft: home.width_ft,
          length_ft: home.length_ft,
          sqft: home.sqft,
          listed_price_cents: home.listed_price_cents,
          manufacturer_name: (Array.isArray(mfr) ? mfr[0]?.name : mfr?.name) ?? null,
        }
      : null,
    quote: quote ? { total_cents: quote.listed_price_cents } : null,
    tradeIn: tradeIn
      ? { year: tradeIn.year, make: tradeIn.make, model: tradeIn.model, offer_cents: tradeIn.offer_cents }
      : null,
    org: org ? { name: org.name } : null,
    nowIso: new Date().toISOString(),
  };

  // ── Resolve bindings → snapshot + prefill ───────────────────────────────
  const prefill: Record<string, string> = {};
  const snapshotFields: Array<Record<string, unknown>> = [];
  let listedPriceCents: number | null = null;

  for (const f of fieldMap) {
    if (f.source !== 'binding' || !f.binding_key || !isBindingKey(f.binding_key)) continue;
    const r = resolveBinding(f.binding_key as BindingKey, ctx);
    if (r.display != null) prefill[f.provider_field_id] = r.display;
    if (f.binding_key === 'home.listed_price_cents' && r.valueCents != null) listedPriceCents = r.valueCents;
    snapshotFields.push({
      provider_field_id: f.provider_field_id,
      source: f.source,
      binding_key: f.binding_key,
      signer_role: null,
      value: r.value,
      value_cents: r.valueCents,
      display: r.display,
    });
  }

  // ── Build recipients from signer rows, in signing order ─────────────────
  const signerRows = fieldMap.filter((f) => f.source === 'signer' && f.signer_role);
  const orderedRoles = ROLE_ORDER.filter((role) => signerRows.some((s) => s.signer_role === role));
  if (orderedRoles.length === 0) return { ok: false, error: 'No signers mapped on this template. Map at least one.' };

  const recipients: EsignRecipientInput[] = signerRows
    .slice()
    .sort((a, b) => ROLE_ORDER.indexOf(a.signer_role!) - ROLE_ORDER.indexOf(b.signer_role!))
    .map((s) => {
      const id = recipientIdentity(s.signer_role!, { leadName: lead.contact_name, leadEmail: lead.email, orgName: org?.name ?? null }, args.leadId);
      return { role: s.signer_role!, placeholderName: s.provider_field_id, name: id.name, email: id.email };
    });

  // ── Insert the instance (snapshot frozen here) ──────────────────────────
  const { data: nextNum } = await supabase.rpc('next_document_number', { p_org_id: orgId });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: instance, error: insErr } = await supabase
    .from('document_instances')
    .insert({
      org_id: orgId,
      lead_id: args.leadId,
      template_id: args.templateId,
      home_id: lead.home_id,
      provider: process.env.ESIGN_PROVIDER ?? 'signwell',
      status: 'draft',
      doc_number: (nextNum as number) ?? null,
      snapshot_jsonb: { fields: snapshotFields, generated_at: ctx.nowIso },
      listed_price_cents: listedPriceCents,
      created_by: user?.id ?? null,
    })
    .select('id')
    .single();
  if (insErr || !instance) return { ok: false, error: insErr?.message ?? 'Could not create document.' };

  // ── Create the SignWell envelope (embedded, in-person) ──────────────────
  const publicBase = process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomecenter.com';
  let envelope;
  try {
    envelope = await getEsignProvider().createEnvelopeFromTemplate({
      providerTemplateId: template.provider_template_id,
      recipients,
      prefill,
      inPerson: mode === 'in_person',
      testMode: process.env.ESIGN_TEST_MODE !== 'false',
      redirectUrl: `${publicBase}/sign/return`,
      name: `Doc #${(nextNum as number) ?? ''} · ${lead.contact_name ?? 'Lead'}`,
    });
  } catch (e) {
    // Roll back the instance so we don't leave an orphan.
    await supabase.from('document_instances').delete().eq('id', instance.id);
    return { ok: false, error: e instanceof Error ? e.message : 'E-sign envelope creation failed.' };
  }

  // ── Persist envelope id + open an in-person signing session ─────────────
  const svc = createServiceClient();
  const recipientMap: Record<string, { recipientId: string; embeddedUrl?: string | null }> = {};
  for (const r of envelope.recipients) {
    recipientMap[r.role] = { recipientId: r.recipientId, embeddedUrl: r.embeddedUrl };
  }

  await supabase
    .from('document_instances')
    .update({ provider_envelope_id: envelope.envelopeId, status: 'sent' })
    .eq('id', instance.id);

  const { data: session, error: sessErr } = await svc
    .from('signing_sessions')
    .insert({
      instance_id: instance.id,
      org_id: orgId,
      mode,
      status: 'pending',
      signer_roles: orderedRoles,
      current_role_idx: 0,
      recipient_map_jsonb: recipientMap,
      remote_email: mode === 'remote' ? lead.email : null,
      created_by: user?.id ?? null,
    })
    .select('session_token')
    .single();
  if (sessErr || !session) return { ok: false, error: sessErr?.message ?? 'Could not start signing session.' };

  // Timeline note on the lead.
  await supabase.from('lead_messages').insert({
    lead_id: args.leadId,
    org_id: orgId,
    kind: 'system',
    channel: null,
    body:
      mode === 'remote'
        ? `Document #${(nextNum as number) ?? ''} emailed${lead.email ? ` to ${lead.email}` : ''} for remote signing.`
        : `Document #${(nextNum as number) ?? ''} generated and ready for in-person signing.`,
  });

  revalidatePath(`/leads/${args.leadId}`);
  return { ok: true, sessionToken: session.session_token, instanceId: instance.id, mode };
}
