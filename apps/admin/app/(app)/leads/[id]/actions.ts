'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@uhs/db/server';
import { createServiceClient } from '@uhs/db/service';
import type { LeadMessage, LeadStage, LineItem, MessageChannel, MessageKind, MilestoneStatus, PaymentMethod } from '@uhs/db';
import { sendEmail, sendSms } from '../../../../lib/notify';
import { renderQuotePdf, type QuotePdfData } from '../../../../lib/quote-pdf';
import { renderInvoicePdf, type InvoicePdfData } from '../../../../lib/invoice-pdf';
import { dispatchWorkflowEvent } from '../../../../lib/workflows';

export async function postMessage(
  leadId: string,
  orgId: string,
  kind: MessageKind,
  channel: MessageChannel | null,
  bodyText: string,
): Promise<LeadMessage> {
  const supabase = createClient();
  const trimmed = bodyText.trim();

  const { data, error } = await supabase
    .from('lead_messages')
    .insert({ lead_id: leadId, org_id: orgId, kind, channel, body: trimmed })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Insert failed');

  // Outbound dispatch — SendGrid for email, Twilio for SMS. Helpers no-op when
  // credentials aren't configured (local dev), so the timeline still records.
  if (kind === 'outbound') {
    const { data: lead } = await supabase
      .from('leads')
      .select('contact_name, email, phone, reply_token, sms_consent, homes(name, stock_no)')
      .eq('id', leadId)
      .maybeSingle();

    if (channel === 'email' && lead?.email) {
      const homeRel = (lead as unknown as { homes: { name: string; stock_no: string } | { name: string; stock_no: string }[] | null }).homes;
      const home = Array.isArray(homeRel) ? homeRel[0] : homeRel;
      const subject = home
        ? `RE: ${home.name} (${home.stock_no})`
        : 'RE: Your inquiry with Upstate Home Sales';
      const result = await sendEmail({
        to: lead.email,
        subject,
        text: trimmed,
        replyToToken: lead.reply_token,
      });
      if (!result.ok) {
        // Surface as a system note on the timeline so the user knows.
        await supabase.from('lead_messages').insert({
          lead_id: leadId,
          org_id: orgId,
          kind: 'system',
          channel: null,
          body: `Email delivery failed: ${result.error}`,
        });
      }
    }

    if (channel === 'sms' && lead?.phone) {
      if (!lead.sms_consent) {
        throw new Error('Cannot send SMS — customer has not opted in.');
      }
      const result = await sendSms({ to: lead.phone, body: trimmed });
      if (!result.ok) {
        await supabase.from('lead_messages').insert({
          lead_id: leadId,
          org_id: orgId,
          kind: 'system',
          channel: null,
          body: `SMS delivery failed: ${result.error}`,
        });
      }
    }
  }

  revalidatePath(`/leads/${leadId}`);
  return data as LeadMessage;
}

export async function updateLeadStage(leadId: string, stage: LeadStage) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('leads')
    .update({ stage })
    .eq('id', leadId)
    .select('id, stage, org_id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Update failed');
  await dispatchWorkflowEvent({
    event: 'lead.stage.changed',
    orgId: data.org_id,
    payload: { id: data.id, stage: data.stage, lead_id: data.id },
  }).catch((e) => console.error('[lead-stage] workflow dispatch failed:', e));
  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  return data;
}

export async function updateLeadAssignee(leadId: string, userId: string | null) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('leads')
    .update({ assignee_id: userId })
    .eq('id', leadId)
    .select('id, assignee_id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Update failed');
  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  return data;
}

export async function createQuote(args: {
  leadId: string;
  orgId: string;
  homeId: string;
  validDays?: number;
  lineItems: LineItem[];
  notes: string[];
  sendEmail?: boolean;
}): Promise<{ public_token: string; expires_at: string; listed_price_cents: number }> {
  const supabase = createClient();
  const shouldEmail = args.sendEmail ?? true;

  const [{ data: home, error: hErr }, { data: lead }, { data: org }] = await Promise.all([
    supabase
      .from('homes')
      .select('id, name, stock_no, beds, baths, sqft, headline, description, listed_price_cents, model_number, manufacturer, home_type')
      .eq('id', args.homeId)
      .maybeSingle(),
    supabase
      .from('leads')
      .select('contact_name, email, phone, reply_token')
      .eq('id', args.leadId)
      .maybeSingle(),
    supabase
      .from('orgs')
      .select('name, brand_color')
      .eq('id', args.orgId)
      .maybeSingle(),
  ]);
  if (hErr || !home) throw new Error(hErr?.message ?? 'Home not found');

  // Total = sum of priced line items
  const totalCents = args.lineItems.reduce((s, i) => s + (i.amount_cents ?? 0), 0);
  const expires = new Date(Date.now() + (args.validDays ?? 14) * 86_400_000).toISOString();

  const { data: quote, error } = await supabase
    .from('quotes')
    .insert({
      org_id: args.orgId,
      lead_id: args.leadId,
      home_id: args.homeId,
      listed_price_cents: totalCents,
      addons_jsonb: args.lineItems,
      notes_jsonb: args.notes,
      expires_at: expires,
    })
    .select('id, public_token, expires_at, listed_price_cents, created_at')
    .single();
  if (error || !quote) throw new Error(error?.message ?? 'Quote insert failed');

  // Advance lead stage to 'quoted'.
  await supabase.from('leads').update({ stage: 'quoted' }).eq('id', args.leadId);

  const publicBase = process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomecenter.com';
  const publicUrl = `${publicBase}/q/${quote.public_token}`;

  // Render PDF, upload to Storage, persist the path.
  let signedPdfUrl: string | null = null;
  try {
    const pdfData: QuotePdfData = {
      orgName: org?.name ?? 'Upstate Home Sales',
      brandColor: org?.brand_color ?? null,
      homeName: home.name,
      modelNumber: (home as any).model_number ?? null,
      manufacturer: (home as any).manufacturer ?? null,
      stockNo: home.stock_no,
      beds: home.beds ?? null,
      baths: home.baths ?? null,
      sqft: home.sqft ?? null,
      homeType: (home as any).home_type ?? null,
      headline: home.headline ?? null,
      description: home.description ?? null,
      customerName: lead?.contact_name ?? null,
      customerPhone: lead?.phone ?? null,
      customerEmail: lead?.email ?? null,
      lineItems: args.lineItems,
      totalCents,
      notes: args.notes,
      expiresAt: quote.expires_at,
      createdAt: quote.created_at,
      publicUrl,
    };
    const buf = await renderQuotePdf(pdfData);
    const path = `${args.orgId}/${quote.id}.pdf`;
    const svc = createServiceClient();
    const { error: upErr } = await svc.storage
      .from('quote-pdfs')
      .upload(path, buf, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw upErr;
    await supabase.from('quotes').update({ pdf_storage_path: path }).eq('id', quote.id);

    const { data: signed, error: signErr } = await svc.storage
      .from('quote-pdfs')
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (!signErr && signed?.signedUrl) signedPdfUrl = signed.signedUrl;
  } catch (e) {
    console.error('[quote] PDF generation/upload failed:', e);
  }

  // System message in the timeline.
  await supabase.from('lead_messages').insert({
    lead_id: args.leadId,
    org_id: args.orgId,
    kind: 'system',
    channel: null,
    body: `Quote created · ${publicUrl} · expires ${new Date(quote.expires_at).toLocaleDateString()}`,
  });

  // Email the customer if requested and we have an address.
  if (shouldEmail && lead?.email) {
    const lines = [
      `Hi ${lead.contact_name},`,
      '',
      `Here's your quote for ${home.name} (${home.stock_no}).`,
      '',
      `View online: ${publicUrl}`,
    ];
    if (signedPdfUrl) {
      lines.push(`Download PDF (good for 7 days): ${signedPdfUrl}`);
    }
    lines.push(
      '',
      "Reply to this email with any questions — we'll get back to you the same business day.",
      '',
      '— Upstate Home Sales',
    );
    await sendEmail({
      to: lead.email,
      subject: `Your quote for ${home.name}`,
      replyToToken: lead.reply_token,
      text: lines.join('\n'),
    }).catch((e) => console.error('[quote] customer email failed:', e));
  }

  await dispatchWorkflowEvent({
    event: 'quote.sent',
    orgId: args.orgId,
    payload: {
      quote_id: quote.id,
      lead_id: args.leadId,
      home_id: args.homeId,
      listed_price_cents: quote.listed_price_cents,
      public_token: quote.public_token,
    },
  }).catch((e) => console.error('[quote] workflow dispatch failed:', e));

  revalidatePath(`/leads/${args.leadId}`);
  return {
    public_token: quote.public_token,
    expires_at: quote.expires_at,
    listed_price_cents: quote.listed_price_cents,
  };
}

// ─── Invoice creation ─────────────────────────────────────────────────────

export async function createInvoice(args: {
  leadId: string;
  orgId: string;
  homeId: string;
  quoteId?: string;
  lineItems: LineItem[];
  notes: string[];
  paymentTerms: string;
  paymentInstructions: string | null;
  dueAt: string | null;
  sendEmail?: boolean;
}): Promise<{ public_token: string; invoice_number: number; listed_price_cents: number }> {
  const supabase = createClient();
  const shouldEmail = args.sendEmail ?? true;

  const [{ data: home, error: hErr }, { data: lead }, { data: org }] = await Promise.all([
    supabase
      .from('homes')
      .select('id, name, stock_no')
      .eq('id', args.homeId)
      .maybeSingle(),
    supabase
      .from('leads')
      .select('contact_name, email, phone, reply_token')
      .eq('id', args.leadId)
      .maybeSingle(),
    supabase
      .from('orgs')
      .select('name, brand_color')
      .eq('id', args.orgId)
      .maybeSingle(),
  ]);
  if (hErr || !home) throw new Error(hErr?.message ?? 'Home not found');

  const totalCents = args.lineItems.reduce((s, i) => s + (i.amount_cents ?? 0), 0);

  // Get next invoice number
  const { data: nextNumResult } = await supabase.rpc('next_invoice_number', { p_org_id: args.orgId });
  const invoiceNumber = (nextNumResult as number) ?? 1;

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      org_id: args.orgId,
      lead_id: args.leadId,
      home_id: args.homeId,
      quote_id: args.quoteId ?? null,
      invoice_number: invoiceNumber,
      listed_price_cents: totalCents,
      line_items_jsonb: args.lineItems,
      notes_jsonb: args.notes,
      payment_terms: args.paymentTerms,
      payment_instructions: args.paymentInstructions,
      due_at: args.dueAt ? new Date(args.dueAt).toISOString() : null,
    })
    .select('id, public_token, invoice_number, listed_price_cents, created_at')
    .single();
  if (error || !invoice) throw new Error(error?.message ?? 'Invoice insert failed');

  const publicBase = process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomecenter.com';
  const publicUrl = `${publicBase}/inv/${invoice.public_token}`;

  // Render PDF and upload
  let signedPdfUrl: string | null = null;
  try {
    const pdfData: InvoicePdfData = {
      orgName: org?.name ?? 'Upstate Home Sales',
      brandColor: org?.brand_color ?? null,
      invoiceNumber: invoice.invoice_number,
      homeName: home.name,
      stockNo: home.stock_no,
      customerName: lead?.contact_name ?? null,
      customerPhone: lead?.phone ?? null,
      customerEmail: lead?.email ?? null,
      lineItems: args.lineItems,
      totalCents,
      paidCents: 0,
      balanceCents: totalCents,
      payments: [],
      notes: args.notes,
      paymentTerms: args.paymentTerms,
      paymentInstructions: args.paymentInstructions,
      dueAt: args.dueAt,
      createdAt: invoice.created_at,
      publicUrl,
    };
    const buf = await renderInvoicePdf(pdfData);
    const path = `${args.orgId}/inv-${invoice.id}.pdf`;
    const svc = createServiceClient();
    const { error: upErr } = await svc.storage
      .from('quote-pdfs')
      .upload(path, buf, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw upErr;
    await supabase.from('invoices').update({ pdf_storage_path: path }).eq('id', invoice.id);

    const { data: signed, error: signErr } = await svc.storage
      .from('quote-pdfs')
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (!signErr && signed?.signedUrl) signedPdfUrl = signed.signedUrl;
  } catch (e) {
    console.error('[invoice] PDF generation/upload failed:', e);
  }

  // Timeline message
  await supabase.from('lead_messages').insert({
    lead_id: args.leadId,
    org_id: args.orgId,
    kind: 'system',
    channel: null,
    body: `Invoice #${invoice.invoice_number} created · ${publicUrl}`,
  });

  // Email
  if (shouldEmail && lead?.email) {
    const lines = [
      `Hi ${lead.contact_name},`,
      '',
      `Here's your invoice (#${invoice.invoice_number}) for ${home.name} (${home.stock_no}).`,
      '',
      `View online: ${publicUrl}`,
    ];
    if (signedPdfUrl) {
      lines.push(`Download PDF (good for 7 days): ${signedPdfUrl}`);
    }
    lines.push(
      '',
      "Reply to this email with any questions — we'll get back to you the same business day.",
      '',
      '— Upstate Home Sales',
    );
    await sendEmail({
      to: lead.email,
      subject: `Invoice #${invoice.invoice_number} for ${home.name}`,
      replyToToken: lead.reply_token,
      text: lines.join('\n'),
    }).catch((e) => console.error('[invoice] customer email failed:', e));
  }

  await dispatchWorkflowEvent({
    event: 'invoice.sent',
    orgId: args.orgId,
    payload: {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      lead_id: args.leadId,
      home_id: args.homeId,
      listed_price_cents: invoice.listed_price_cents,
      public_token: invoice.public_token,
    },
  }).catch((e) => console.error('[invoice] workflow dispatch failed:', e));

  revalidatePath(`/leads/${args.leadId}`);
  return {
    public_token: invoice.public_token,
    invoice_number: invoice.invoice_number,
    listed_price_cents: invoice.listed_price_cents,
  };
}

// ─── Payment recording ───────────────────────────────────────────────────

export async function recordPayment(args: {
  invoiceId: string;
  orgId: string;
  leadId: string;
  amountCents: number;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
}) {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id ?? null;

  const { data: payment, error } = await supabase
    .from('invoice_payments')
    .insert({
      invoice_id: args.invoiceId,
      org_id: args.orgId,
      amount_cents: args.amountCents,
      method: args.method,
      reference: args.reference,
      note: args.note,
      recorded_by: uid,
    })
    .select('*')
    .single();
  if (error || !payment) throw new Error(error?.message ?? 'Payment insert failed');

  const fmtAmt = (args.amountCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  await supabase.from('lead_messages').insert({
    lead_id: args.leadId,
    org_id: args.orgId,
    kind: 'system',
    channel: null,
    body: `Payment recorded: ${fmtAmt} (${args.method}${args.reference ? ` — ${args.reference}` : ''})`,
  });

  revalidatePath(`/leads/${args.leadId}`);
  return payment;
}

export async function toggleLeadHot(leadId: string, isHot: boolean) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('leads')
    .update({ is_hot: isHot })
    .eq('id', leadId)
    .select('id, is_hot')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Update failed');
  revalidatePath(`/leads/${leadId}`);
  return data;
}

// ─── Customer portal integration (Phase D) ─────────────────────────────────

/**
 * Resolves the buyer linked to a lead, creating the link if a buyer with the
 * lead's email already exists. Returns null if the lead has no email or no
 * matching buyer (the buyer hasn't signed up yet).
 */
async function resolveBuyerForLead(leadId: string): Promise<string | null> {
  const sb = createServiceClient();
  const { data: lead } = await sb
    .from('leads')
    .select('id, org_id, email')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return null;

  // Already linked?
  const { data: existing } = await sb
    .from('buyer_lead_links')
    .select('buyer_id')
    .eq('lead_id', leadId)
    .maybeSingle();
  if (existing) return existing.buyer_id;

  // Find a buyer with this email and link.
  if (!lead.email) return null;
  const { data: buyer } = await sb
    .from('buyers')
    .select('id')
    .eq('email', lead.email.toLowerCase())
    .maybeSingle();
  if (!buyer) return null;

  await sb.from('buyer_lead_links').insert({
    buyer_id: buyer.id,
    lead_id: leadId,
    org_id: lead.org_id,
    status: 'active',
  });
  return buyer.id;
}

export async function suggestHomeForLead(args: {
  leadId: string;
  homeId: string;
  note: string | null;
}): Promise<{ ok: true; status: 'suggested' | 'queued' } | { ok: false; error: string }> {
  const supabase = createClient();
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, org_id')
    .eq('id', args.leadId)
    .maybeSingle();
  if (leadErr || !lead) return { ok: false, error: 'Lead not found' };

  const buyerId = await resolveBuyerForLead(args.leadId);
  if (!buyerId) {
    return { ok: false, error: 'This buyer is not signed up for the portal yet. Invite them first.' };
  }

  const { error } = await supabase
    .from('buyer_suggested_homes')
    .upsert(
      {
        buyer_id: buyerId,
        home_id: args.homeId,
        org_id: lead.org_id,
        note: args.note,
      },
      { onConflict: 'buyer_id,home_id' },
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/leads/${args.leadId}`);
  return { ok: true, status: 'suggested' };
}

export async function createMilestone(args: {
  leadId: string;
  title: string;
  body: string | null;
  status: MilestoneStatus;
  dueAt: string | null;
}) {
  const supabase = createClient();
  const { data: lead } = await supabase
    .from('leads')
    .select('org_id')
    .eq('id', args.leadId)
    .maybeSingle();
  if (!lead) throw new Error('Lead not found');

  // Next sort_order
  const { data: max } = await supabase
    .from('lead_milestones')
    .select('sort_order')
    .eq('lead_id', args.leadId)
    .order('sort_order', { ascending: false })
    .limit(1);
  const nextOrder = (max?.[0]?.sort_order ?? -1) + 1;

  const { error } = await supabase.from('lead_milestones').insert({
    lead_id: args.leadId,
    org_id: lead.org_id,
    title: args.title.trim() || 'Milestone',
    body: args.body,
    status: args.status,
    sort_order: nextOrder,
    due_at: args.dueAt,
    completed_at: args.status === 'complete' ? new Date().toISOString() : null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/leads/${args.leadId}`);
}

export async function updateMilestoneStatus(args: { id: string; leadId: string; status: MilestoneStatus }) {
  const supabase = createClient();
  const completedAt = args.status === 'complete' ? new Date().toISOString() : null;
  const { error } = await supabase
    .from('lead_milestones')
    .update({ status: args.status, completed_at: completedAt })
    .eq('id', args.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/leads/${args.leadId}`);
}

export async function deleteMilestone(args: { id: string; leadId: string }) {
  const supabase = createClient();
  const { error } = await supabase.from('lead_milestones').delete().eq('id', args.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/leads/${args.leadId}`);
}

/**
 * PR 1.2 — Send a magic-link invite so a lead can sign in to /portal without
 * a password. Uses Supabase Admin's generateLink so we control the email
 * channel (Resend) rather than relying on Supabase's built-in mailer.
 */
export async function inviteBuyerToPortal(args: { leadId: string }):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = createServiceClient();
  const { data: lead } = await sb
    .from('leads')
    .select('id, email, contact_name, reply_token, org_id, orgs(name)')
    .eq('id', args.leadId)
    .maybeSingle();
  if (!lead) return { ok: false, error: 'Lead not found.' };
  if (!lead.email) return { ok: false, error: 'Lead has no email on file.' };

  const publicBase = process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomecenter.com';
  const redirectTo = `${publicBase}/portal/auth/callback?next=${encodeURIComponent('/portal')}`;

  const { data: linkRes, error: linkErr } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email: lead.email,
    options: { redirectTo },
  });

  const actionLink = linkRes?.properties?.action_link;
  if (linkErr || !actionLink) {
    return { ok: false, error: linkErr?.message ?? 'Magic-link generation failed.' };
  }

  const orgRel = (lead as unknown as { orgs: { name: string } | { name: string }[] | null }).orgs;
  const orgName =
    (Array.isArray(orgRel) ? orgRel[0]?.name : orgRel?.name) ?? 'Upstate Home Sales';

  const buyerName = lead.contact_name?.trim() || 'there';
  const emailResult = await sendEmail({
    to: lead.email,
    subject: `Your ${orgName} buyer portal is ready`,
    replyToToken: lead.reply_token,
    text: [
      `Hi ${buyerName},`,
      '',
      `${orgName} set you up with a buyer portal. From there you'll see homes we've shortlisted, upload documents securely, and track your milestones.`,
      '',
      `Open your portal: ${actionLink}`,
      '',
      `This link signs you in automatically. If you didn't expect this email, just ignore it.`,
      '',
      `— ${orgName}`,
    ].join('\n'),
  });

  if (!emailResult.ok && !emailResult.skipped) {
    return { ok: false, error: emailResult.error ?? 'Email send failed.' };
  }

  // Drop a system note on the timeline so the rep can see the invite went out.
  const noteSuffix = emailResult.skipped ? ' (Resend not configured — link in server logs)' : '';
  await sb.from('lead_messages').insert({
    lead_id: lead.id,
    org_id: lead.org_id,
    kind: 'system',
    channel: null,
    body: `Buyer portal invite sent to ${lead.email}${noteSuffix}`,
  });

  if (emailResult.skipped) {
    console.warn('[invite-buyer] magic link (Resend skipped):', actionLink);
  }

  revalidatePath(`/leads/${args.leadId}`);
  return { ok: true };
}
