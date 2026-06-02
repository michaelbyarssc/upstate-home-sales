'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@uhs/db/server';
import { createServiceClient } from '@uhs/db/service';
import type { CollabRole, LeadMessage, LeadPreferences, LeadPreferencesInput, LeadStage, LineItem, MessageChannel, MessageKind, MilestoneStatus, PaymentMethod } from '@uhs/db';
import { sendEmail, sendSms } from '../../../../lib/notify';
import { matchHomes, type HomeMatch, type MatchableHome } from '../../../../lib/match-homes';
import { renderQuotePdf, type QuotePdfData } from '../../../../lib/quote-pdf';
import { renderInvoicePdf, type InvoicePdfData } from '../../../../lib/invoice-pdf';
import { renderPoPdf, type PoPdfData } from '../../../../lib/po-pdf';
import { dispatchWorkflowEvent } from '../../../../lib/workflows';
import { buildDefaultLineItems } from '../../../../lib/default-line-items';

/** Extract a plain-English reason from an API error string. */
function parseDeliveryError(raw: string | undefined): string {
  if (!raw) return 'unknown error';
  // Try to pull a "message" field out of a JSON body embedded in the string.
  const jsonMatch = raw.match(/\{.*\}/s);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.message === 'string') return parsed.message;
    } catch { /* not JSON, fall through */ }
  }
  // Strip the "Resend 403: " prefix if present
  return raw.replace(/^Resend \d+:\s*/i, '').slice(0, 200);
}

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
        : 'RE: Your inquiry with Upstate Home Center';
      const result = await sendEmail({
        to: lead.email,
        subject,
        text: trimmed,
        replyToToken: lead.reply_token,
      });
      if (!result.ok) {
        const reason = parseDeliveryError(result.error);
        await supabase.from('lead_messages').insert({
          lead_id: leadId,
          org_id: orgId,
          kind: 'system',
          channel: null,
          body: `Email could not be delivered — ${reason}`,
        });
      } else if (result.skipped) {
        // Email was no-op because Resend isn't configured — note it so the
        // user doesn't think the customer got a message they actually didn't.
        await supabase.from('lead_messages').insert({
          lead_id: leadId,
          org_id: orgId,
          kind: 'system',
          channel: null,
          body: '⚠ Email not sent — Resend is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL / EMAIL_INBOUND_DOMAIN missing). Message saved to timeline only.',
        });
      }
    }

    if (channel === 'sms' && lead?.phone) {
      if (!lead.sms_consent) {
        throw new Error('Cannot send SMS — customer has not opted in.');
      }
      const result = await sendSms({ to: lead.phone, body: trimmed });
      if (!result.ok) {
        const reason = parseDeliveryError(result.error);
        await supabase.from('lead_messages').insert({
          lead_id: leadId,
          org_id: orgId,
          kind: 'system',
          channel: null,
          body: `SMS could not be delivered — ${reason}`,
        });
      } else if (result.skipped) {
        // Twilio not configured locally — message saved to timeline but
        // never actually left the building. Make that explicit.
        await supabase.from('lead_messages').insert({
          lead_id: leadId,
          org_id: orgId,
          kind: 'system',
          channel: null,
          body: '⚠ SMS not sent — Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER missing). Message saved to timeline only.',
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
  selectedPhotoIds?: string[];
  pricingMode?: 'flat' | 'itemized';
  /**
   * Draft mode (e.g. auto-created when a home is assigned to a lead): never
   * emails the customer, doesn't advance the lead stage, isn't shown in the
   * buyer portal, and doesn't fire the `quote.sent` automation. The dealer
   * reviews/sends it later from the quotes list.
   */
  draft?: boolean;
}): Promise<{ id: string; public_token: string; expires_at: string; listed_price_cents: number; created_at: string; home_id: string }> {
  const supabase = createClient();
  const shouldEmail = args.draft ? false : (args.sendEmail ?? true);

  const [{ data: home, error: hErr }, { data: lead }, { data: org }, { data: { user } }] = await Promise.all([
    supabase
      .from('homes')
      .select('id, name, stock_no, beds, baths, beds_options, baths_options, sqft, headline, description, listed_price_cents, model, type, manufacturers(name)')
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
    supabase.auth.getUser(),
  ]);
  if (hErr || !home) throw new Error(hErr?.message ?? 'Home not found');

  // Build photo URLs
  let photos: { url: string; caption: string | null }[] = [];
  if (args.selectedPhotoIds && args.selectedPhotoIds.length > 0) {
    const { data: photoRows } = await supabase
      .from('home_photos')
      .select('id, storage_path, alt_text, sort_order')
      .in('id', args.selectedPhotoIds)
      .order('sort_order');
    if (photoRows) {
      const baseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/home-photos`;
      photos = photoRows.map((p) => ({
        url: `${baseUrl}/${p.storage_path}`,
        caption: p.alt_text,
      }));
    }
  }

  // Build prepared-by from current user
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const preparedBy = {
    name: (typeof meta.full_name === 'string' && meta.full_name) || user?.email || null,
    phone: (typeof meta.phone === 'string' && meta.phone) || null,
    email: user?.email || null,
  };

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
      // Draft quotes are staged privately until the dealer reviews + sends.
      visible_to_buyer: args.draft ? false : true,
    })
    .select('id, public_token, expires_at, listed_price_cents, created_at')
    .single();
  if (error || !quote) throw new Error(error?.message ?? 'Quote insert failed');

  // Advance lead stage to 'quoted' — only when actually quoting (not a draft).
  if (!args.draft) {
    await supabase.from('leads').update({ stage: 'quoted' }).eq('id', args.leadId);
  }

  const publicBase = process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomecenter.com';
  const publicUrl = `${publicBase}/q/${quote.public_token}`;

  // Render PDF, upload to Storage, persist the path.
  let signedPdfUrl: string | null = null;
  try {
    const pdfData: QuotePdfData = {
      orgName: org?.name ?? 'Upstate Home Center',
      brandColor: org?.brand_color ?? null,
      homeName: home.name,
      modelNumber: (home as any).model ?? null,
      manufacturer: (home as any).manufacturers?.name ?? null,
      stockNo: home.stock_no,
      beds: home.beds ?? null,
      baths: home.baths ?? null,
      bedsOptions: (home as any).beds_options ?? null,
      bathsOptions: (home as any).baths_options ?? null,
      sqft: home.sqft ?? null,
      homeType: (home as any).type ?? null,
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
      photos,
      preparedBy,
      pricingMode: args.pricingMode ?? 'flat',
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
    body: args.draft
      ? `Draft quote auto-created on home assignment · expires ${new Date(quote.expires_at).toLocaleDateString()}`
      : `Quote created · ${publicUrl} · expires ${new Date(quote.expires_at).toLocaleDateString()}`,
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
      '— Upstate Home Center',
    );
    await sendEmail({
      to: lead.email,
      subject: `Your quote for ${home.name}`,
      replyToToken: lead.reply_token,
      text: lines.join('\n'),
    }).catch((e) => console.error('[quote] customer email failed:', e));
  }

  // A draft isn't "sent" — don't trigger quote.sent automations.
  if (!args.draft) {
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
  }

  revalidatePath(`/leads/${args.leadId}`);
  return {
    id: quote.id,
    public_token: quote.public_token,
    expires_at: quote.expires_at,
    listed_price_cents: quote.listed_price_cents,
    created_at: quote.created_at,
    home_id: args.homeId,
  };
}

// ─── Quote preview (no DB write) ──────────────────────────────────────────

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
  /** Form 500 / PO fields collected at the invoice phase (0043). */
  poDetails?: {
    deliveryAddress: string | null;
    deliveryCity: string | null;
    deliveryState: string | null;
    deliveryZip: string | null;
    mailingAddress: string | null;
    coBuyerName: string | null;
    serialNo: string | null;
    salesTaxCents: number;
    feesCents: number;
    cashDepositCents: number;
    cashAsAgreedCents: number;
  };
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
      sales_tax_cents: args.poDetails?.salesTaxCents ?? 0,
      fees_cents: args.poDetails?.feesCents ?? 0,
      cash_deposit_cents: args.poDetails?.cashDepositCents ?? 0,
      cash_as_agreed_cents: args.poDetails?.cashAsAgreedCents ?? 0,
    })
    .select('id, public_token, invoice_number, listed_price_cents, created_at')
    .single();
  if (error || !invoice) throw new Error(error?.message ?? 'Invoice insert failed');

  // Persist the PO/Form-500 fields back to the reusable lead + home records so
  // they're ready when this invoice becomes a PO.
  if (args.poDetails) {
    const pd = args.poDetails;
    await supabase
      .from('leads')
      .update({
        delivery_address: pd.deliveryAddress,
        delivery_city: pd.deliveryCity,
        delivery_state: pd.deliveryState,
        delivery_zip: pd.deliveryZip,
        mailing_address: pd.mailingAddress,
        co_buyer_name: pd.coBuyerName,
      })
      .eq('id', args.leadId);
    if (pd.serialNo != null && pd.serialNo !== '') {
      await supabase.from('homes').update({ serial_no: pd.serialNo }).eq('id', args.homeId);
    }
  }

  const publicBase = process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomecenter.com';
  const publicUrl = `${publicBase}/inv/${invoice.public_token}`;

  // Render PDF and upload
  let signedPdfUrl: string | null = null;
  try {
    const pdfData: InvoicePdfData = {
      orgName: org?.name ?? 'Upstate Home Center',
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
      '— Upstate Home Center',
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

// ─── SMS consent (admin toggle + email opt-in link) ──────────────────────

export async function setLeadSmsConsent(args: {
  leadId: string;
  consent: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: lead } = await supabase
    .from('leads')
    .select('org_id')
    .eq('id', args.leadId)
    .maybeSingle();
  if (!lead) return { ok: false, error: 'Lead not found' };

  const now = new Date().toISOString();
  const update = args.consent
    ? {
        sms_consent: true,
        sms_consent_at: now,
        sms_consent_method: 'admin' as const,
      }
    : {
        sms_consent: false,
      };

  const { error } = await supabase
    .from('leads')
    .update(update)
    .eq('id', args.leadId);
  if (error) return { ok: false, error: error.message };

  const actor = user?.email ?? 'an admin';
  await supabase.from('lead_messages').insert({
    lead_id: args.leadId,
    org_id: lead.org_id,
    kind: 'system',
    channel: null,
    body: args.consent
      ? `SMS consent recorded by ${actor}`
      : `SMS consent revoked by ${actor}`,
  });

  revalidatePath(`/leads/${args.leadId}`);
  return { ok: true };
}

export async function sendSmsOptInLink(args: {
  leadId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const { data: lead } = await supabase
    .from('leads')
    .select('id, email, contact_name, org_id, sms_opt_in_token, reply_token, orgs(name)')
    .eq('id', args.leadId)
    .maybeSingle();
  if (!lead) return { ok: false, error: 'Lead not found' };
  if (!lead.email) return { ok: false, error: 'Lead has no email on file' };

  // Reuse the existing token if one exists, otherwise mint one.
  let token = (lead as any).sms_opt_in_token as string | null;
  if (!token) {
    token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const svc = createServiceClient();
    const { error: tokenErr } = await svc
      .from('leads')
      .update({ sms_opt_in_token: token })
      .eq('id', args.leadId);
    if (tokenErr) return { ok: false, error: tokenErr.message };
  }

  const publicBase = process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomecenter.com';
  const link = `${publicBase}/sms-opt-in/${token}`;

  const orgRel = (lead as unknown as { orgs: { name: string } | { name: string }[] | null }).orgs;
  const orgName =
    (Array.isArray(orgRel) ? orgRel[0]?.name : orgRel?.name) ?? 'Upstate Home Center';
  const buyerName = lead.contact_name?.trim() || 'there';

  const result = await sendEmail({
    to: lead.email,
    subject: `Confirm SMS updates from ${orgName}`,
    replyToToken: lead.reply_token,
    text: [
      `Hi ${buyerName},`,
      '',
      `${orgName} would like your okay to send text-message updates about your home purchase (delivery timing, milestones, document requests).`,
      '',
      `Tap to confirm — it takes one second:`,
      link,
      '',
      `You can reply STOP to any text we send to opt out at any time. Message and data rates may apply.`,
      '',
      `If you didn't expect this email, just ignore it.`,
      '',
      `— ${orgName}`,
    ].join('\n'),
  });

  if (!result.ok && !result.skipped) {
    return { ok: false, error: result.error ?? 'Email send failed' };
  }

  await supabase.from('lead_messages').insert({
    lead_id: args.leadId,
    org_id: lead.org_id,
    kind: 'system',
    channel: null,
    body: result.skipped
      ? `SMS opt-in link generated (Resend not configured — link in server logs): ${link}`
      : `SMS opt-in confirmation link emailed to ${lead.email}`,
  });

  if (result.skipped) {
    console.warn('[sms-opt-in] (Resend skipped):', link);
  }

  revalidatePath(`/leads/${args.leadId}`);
  return { ok: true };
}

// ─── Dealer doc visibility + delete (quotes / invoices / purchase_orders) ─

type DealerDocKind = 'quote' | 'invoice' | 'po';

function tableFor(kind: DealerDocKind): 'quotes' | 'invoices' | 'purchase_orders' {
  if (kind === 'quote') return 'quotes';
  if (kind === 'invoice') return 'invoices';
  return 'purchase_orders';
}

export async function setDocVisibility(args: {
  kind: DealerDocKind;
  id: string;
  leadId: string;
  visible: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from(tableFor(args.kind))
    .update({ visible_to_buyer: args.visible })
    .eq('id', args.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/leads/${args.leadId}`);
  return { ok: true };
}

export async function deleteDealerDoc(args: {
  kind: DealerDocKind;
  id: string;
  leadId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const table = tableFor(args.kind);

  // Fetch the PDF path so we can remove the file from storage.
  const { data: row } = await supabase
    .from(table)
    .select('pdf_storage_path')
    .eq('id', args.id)
    .maybeSingle();

  if (row?.pdf_storage_path) {
    try {
      const svc = createServiceClient();
      await svc.storage.from('quote-pdfs').remove([row.pdf_storage_path]);
    } catch (e) {
      console.warn('[deleteDealerDoc] storage remove failed:', e);
    }
  }

  const { error } = await supabase.from(table).delete().eq('id', args.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/leads/${args.leadId}`);
  return { ok: true };
}

// ─── Purchase order creation ──────────────────────────────────────────────

export async function createPurchaseOrder(args: {
  leadId: string;
  orgId: string;
  homeId: string;
  quoteId?: string;
  lineItems: LineItem[];
  notes: string[];
  terms: string | null;
  deliveryDate: string | null;
  sendEmail?: boolean;
}): Promise<{ public_token: string; po_number: number; listed_price_cents: number }> {
  const supabase = createClient();
  const shouldEmail = args.sendEmail ?? true;

  const [{ data: home, error: hErr }, { data: lead }, { data: org }] = await Promise.all([
    supabase
      .from('homes')
      .select('id, name, stock_no, model, year_built, beds, baths, width_ft, length_ft, listed_price_cents, manufacturers(name)')
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

  const { data: nextNumResult } = await supabase.rpc('next_po_number', { p_org_id: args.orgId });
  const poNumber = (nextNumResult as number) ?? 1;

  const manufacturerRel = (home as any).manufacturers;
  const manufacturerName = Array.isArray(manufacturerRel) ? manufacturerRel[0]?.name : manufacturerRel?.name;
  const approxSize = (home as any).width_ft && (home as any).length_ft
    ? `${(home as any).width_ft}x${(home as any).length_ft}`
    : null;

  const { data: po, error } = await supabase
    .from('purchase_orders')
    .insert({
      org_id: args.orgId,
      lead_id: args.leadId,
      home_id: args.homeId,
      quote_id: args.quoteId ?? null,
      po_number: poNumber,
      listed_price_cents: totalCents,
      line_items_jsonb: args.lineItems,
      notes_jsonb: args.notes,
      terms: args.terms,
      delivery_date: args.deliveryDate ? args.deliveryDate : null,
    })
    .select('id, public_token, po_number, listed_price_cents, created_at')
    .single();
  if (error || !po) throw new Error(error?.message ?? 'PO insert failed');

  // Render PDF + upload
  let signedPdfUrl: string | null = null;
  try {
    const pdfData: PoPdfData = {
      orgName: org?.name ?? 'Upstate Home Center',
      orgAddressLines: [
        org?.name ?? 'Upstate Home Center',
        '280 Gossett Rd',
        'Spartanburg, SC 29307',
        '(864) 680-4030',
      ],
      orgPhone: '(864) 680-4030',
      dealerLicense: 'MDL.35948',
      poNumber: po.po_number,
      housingConsultant: null,
      homeName: home.name,
      stockNo: home.stock_no,
      manufacturer: manufacturerName ?? null,
      modelNumber: (home as any).model ?? null,
      approxSize,
      year: (home as any).year_built ?? null,
      beds: (home as any).beds ?? null,
      baths: (home as any).baths ?? null,
      serialNo: null,
      customerName: lead?.contact_name ?? null,
      coBuyerName: null,
      customerPhone: lead?.phone ?? null,
      customerEmail: lead?.email ?? null,
      deliveryAddress: null,
      deliveryCity: null,
      deliveryState: null,
      deliveryZip: null,
      mailingAddress: null,
      lineItems: args.lineItems,
      totalCents,
      homePriceCents: (home as any).listed_price_cents ?? 0,
      salesTaxCents: 0,
      feesCents: 0,
      tradeInAllowanceCents: 0,
      tradeInBalanceOwedCents: 0,
      cashDepositCents: 0,
      cashAsAgreedCents: 0,
      notes: args.notes,
      terms: args.terms,
      deliveryDate: args.deliveryDate,
      createdAt: po.created_at,
    };
    const buf = await renderPoPdf(pdfData);
    const path = `${args.orgId}/po-${po.id}.pdf`;
    const svc = createServiceClient();
    const { error: upErr } = await svc.storage
      .from('quote-pdfs')
      .upload(path, buf, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw upErr;
    await supabase.from('purchase_orders').update({ pdf_storage_path: path }).eq('id', po.id);

    const { data: signed, error: signErr } = await svc.storage
      .from('quote-pdfs')
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (!signErr && signed?.signedUrl) signedPdfUrl = signed.signedUrl;
  } catch (e) {
    console.error('[po] PDF generation/upload failed:', e);
  }

  // Timeline message
  await supabase.from('lead_messages').insert({
    lead_id: args.leadId,
    org_id: args.orgId,
    kind: 'system',
    channel: null,
    body: `Purchase Order #${po.po_number} created${signedPdfUrl ? ` · ${signedPdfUrl}` : ''}`,
  });

  // Email
  if (shouldEmail && lead?.email) {
    const lines = [
      `Hi ${lead.contact_name},`,
      '',
      `Here's your purchase order (#${po.po_number}) for ${home.name} (${home.stock_no}).`,
      '',
    ];
    if (signedPdfUrl) {
      lines.push(`Download PDF (good for 7 days): ${signedPdfUrl}`);
    } else {
      lines.push('Your PDF will be available shortly in your buyer portal.');
    }
    lines.push(
      '',
      "Reply to this email with any questions — we'll get back to you the same business day.",
      '',
      '— Upstate Home Center',
    );
    await sendEmail({
      to: lead.email,
      subject: `Purchase Order #${po.po_number} for ${home.name}`,
      replyToToken: lead.reply_token,
      text: lines.join('\n'),
    }).catch((e) => console.error('[po] customer email failed:', e));
  }

  revalidatePath(`/leads/${args.leadId}`);
  return {
    public_token: po.public_token,
    po_number: po.po_number,
    listed_price_cents: po.listed_price_cents,
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
    (Array.isArray(orgRel) ? orgRel[0]?.name : orgRel?.name) ?? 'Upstate Home Center';

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

// ─── Deal sharing / collaborators ────────────────────────────────────────

export async function searchUsersForSharing(query: string): Promise<Array<{ id: string; email: string; name: string | null }>> {
  if (!query || query.length < 3) return [];
  const sb = createServiceClient();
  const { data } = await sb.auth.admin.listUsers({ perPage: 20 });
  if (!data?.users) return [];
  const q = query.toLowerCase();
  return data.users
    .filter((u) => u.email?.toLowerCase().includes(q))
    .slice(0, 10)
    .map((u) => {
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      const name = (typeof meta.full_name === 'string' && meta.full_name) || null;
      return { id: u.id, email: u.email ?? '', name };
    });
}

export async function addCollaborator(args: {
  leadId: string;
  userId: string;
  role: CollabRole;
  splitPct?: number | null;
  note?: string | null;
}): Promise<{ ok: true }> {
  const supabase = createClient();

  // Validate split sum
  if (args.role === 'split') {
    const pct = args.splitPct ?? 0;
    if (pct <= 0 || pct > 100) throw new Error('Split percentage must be between 1 and 100');
    const { data: existing } = await supabase
      .from('lead_collaborators')
      .select('split_pct')
      .eq('lead_id', args.leadId)
      .eq('role', 'split');
    const currentTotal = (existing ?? []).reduce((s: number, r: any) => s + (r.split_pct ?? 0), 0);
    if (currentTotal + pct > 100) throw new Error(`Split total would exceed 100% (current: ${currentTotal}%)`);
  }

  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('lead_collaborators')
    .insert({
      lead_id: args.leadId,
      user_id: args.userId,
      role: args.role,
      split_pct: args.role === 'split' ? (args.splitPct ?? null) : null,
      added_by: user?.id ?? null,
      note: args.note ?? null,
    });
  if (error) throw new Error(error.message);

  // Get lead org_id for system message
  const { data: lead } = await supabase
    .from('leads')
    .select('org_id')
    .eq('id', args.leadId)
    .maybeSingle();

  if (lead) {
    // Resolve collaborator name
    const sb = createServiceClient();
    const { data: userData } = await sb.auth.admin.getUserById(args.userId);
    const meta = (userData?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const collabName = (typeof meta.full_name === 'string' && meta.full_name) || userData?.user?.email || 'User';

    const splitInfo = args.role === 'split' && args.splitPct ? ` (${args.splitPct}% split)` : '';
    await supabase.from('lead_messages').insert({
      lead_id: args.leadId,
      org_id: lead.org_id,
      kind: 'system',
      channel: null,
      body: `${collabName} added as ${args.role}${splitInfo}`,
    });
  }

  revalidatePath(`/leads/${args.leadId}`);
  return { ok: true };
}

export async function removeCollaborator(args: { leadId: string; collaboratorId: string }): Promise<{ ok: true }> {
  const supabase = createClient();

  // Get collaborator info before deleting
  const { data: collab } = await supabase
    .from('lead_collaborators')
    .select('user_id')
    .eq('id', args.collaboratorId)
    .maybeSingle();

  const { error } = await supabase
    .from('lead_collaborators')
    .delete()
    .eq('id', args.collaboratorId);
  if (error) throw new Error(error.message);

  if (collab) {
    const { data: lead } = await supabase
      .from('leads')
      .select('org_id')
      .eq('id', args.leadId)
      .maybeSingle();

    if (lead) {
      const sb = createServiceClient();
      const { data: userData } = await sb.auth.admin.getUserById(collab.user_id);
      const meta = (userData?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const collabName = (typeof meta.full_name === 'string' && meta.full_name) || userData?.user?.email || 'User';

      await supabase.from('lead_messages').insert({
        lead_id: args.leadId,
        org_id: lead.org_id,
        kind: 'system',
        channel: null,
        body: `${collabName} removed as collaborator`,
      });
    }
  }

  revalidatePath(`/leads/${args.leadId}`);
  return { ok: true };
}

export async function updateCollaboratorSplit(args: {
  collaboratorId: string;
  leadId: string;
  role?: CollabRole;
  splitPct?: number | null;
}): Promise<{ ok: true }> {
  const supabase = createClient();
  const newRole = args.role;
  const newPct = args.splitPct;

  if (newRole === 'split' || (!newRole && newPct != null)) {
    const pct = newPct ?? 0;
    if (pct <= 0 || pct > 100) throw new Error('Split percentage must be between 1 and 100');
    const { data: existing } = await supabase
      .from('lead_collaborators')
      .select('id, split_pct')
      .eq('lead_id', args.leadId)
      .eq('role', 'split');
    const otherTotal = (existing ?? [])
      .filter((r: any) => r.id !== args.collaboratorId)
      .reduce((s: number, r: any) => s + (r.split_pct ?? 0), 0);
    if (otherTotal + pct > 100) throw new Error(`Split total would exceed 100% (others: ${otherTotal}%)`);
  }

  const patch: Record<string, unknown> = {};
  if (newRole) patch.role = newRole;
  if (newPct !== undefined) patch.split_pct = newRole === 'split' || (!newRole && newPct != null) ? newPct : null;

  const { error } = await supabase
    .from('lead_collaborators')
    .update(patch)
    .eq('id', args.collaboratorId);
  if (error) throw new Error(error.message);

  revalidatePath(`/leads/${args.leadId}`);
  return { ok: true };
}

export async function getQuoteForEdit(quoteId: string): Promise<{
  homeId: string;
  lineItems: LineItem[];
  notes: string[];
  validDays: number;
}> {
  const supabase = createClient();
  const { data: quote, error } = await supabase
    .from('quotes')
    .select('home_id, addons_jsonb, notes_jsonb, expires_at, created_at')
    .eq('id', quoteId)
    .single();
  if (error || !quote) throw new Error('Quote not found');

  const diffMs = new Date(quote.expires_at).getTime() - new Date(quote.created_at).getTime();
  const validDays = Math.max(7, Math.round(diffMs / 86_400_000));

  return {
    homeId: quote.home_id,
    lineItems: (quote.addons_jsonb ?? []) as LineItem[],
    notes: (quote.notes_jsonb ?? []) as string[],
    validDays,
  };
}

export async function getQuotePdfUrl(quoteId: string): Promise<string> {
  const supabase = createClient();
  const { data: quote } = await supabase
    .from('quotes')
    .select('pdf_storage_path')
    .eq('id', quoteId)
    .single();
  if (!quote?.pdf_storage_path) throw new Error('No PDF available for this quote');

  const svc = createServiceClient();
  const { data, error } = await svc.storage
    .from('quote-pdfs')
    .createSignedUrl(quote.pdf_storage_path, 60 * 60);
  if (error || !data?.signedUrl) throw new Error('Could not generate PDF link');
  return data.signedUrl;
}

// ─── CRM: buyer requirements + inventory matcher (0041) ─────────────────────

/** Columns the matcher needs from homes. Keep in sync with MatchableHome. */
const MATCH_HOME_COLUMNS =
  'id, name, stock_no, type, manufacturer_id, model, beds, beds_options, baths, baths_options, sqft, width_ft, length_ft, year_built, listed_price_cents, headline, description';

/** Upsert the lead's buyer requirements (one row per lead). created_by/updated_by
 *  are filled by the lead_preferences actor trigger. */
export async function saveLeadPreferences(
  leadId: string,
  input: LeadPreferencesInput,
): Promise<LeadPreferences> {
  const supabase = createClient();
  // org_id comes from the lead (RLS lets an org member read it).
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('org_id')
    .eq('id', leadId)
    .single();
  if (leadErr || !lead) throw new Error('Lead not found');

  const { data, error } = await supabase
    .from('lead_preferences')
    .upsert({ lead_id: leadId, org_id: lead.org_id, ...input }, { onConflict: 'lead_id' })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not save requirements');

  revalidatePath(`/leads/${leadId}`);
  return data as LeadPreferences;
}

/** Rank published inventory against the lead's saved requirements (top 24). */
export async function findMatchingHomes(leadId: string): Promise<HomeMatch[]> {
  const supabase = createClient();
  const { data: prefs } = await supabase
    .from('lead_preferences')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();
  if (!prefs) return [];

  const { data: homes, error } = await supabase
    .from('homes')
    .select(MATCH_HOME_COLUMNS)
    .eq('status', 'published')
    .is('deleted_at', null);
  if (error) throw new Error(error.message);

  return matchHomes(prefs as LeadPreferences, (homes ?? []) as unknown as MatchableHome[]).slice(0, 24);
}

/**
 * Auto-create a private DRAFT quote for a home, reusing the home's default
 * pricing line items. Returns the new quote, or null if the home couldn't be
 * resolved (assignment still succeeds — the dealer can quote it later).
 */
async function createDraftQuoteForHome(
  leadId: string,
  orgId: string,
  homeId: string,
): Promise<{ id: string; public_token: string } | null> {
  const supabase = createClient();
  const { data: home } = await supabase
    .from('homes')
    .select(
      'name, stock_no, listed_price_cents, setup_cents, setup_markup_pct, include_setup_in_price, addons_cents, addons_markup_pct, addons_jsonb',
    )
    .eq('id', homeId)
    .maybeSingle();
  if (!home) return null;

  const lineItems = buildDefaultLineItems({
    name: home.name,
    stock_no: home.stock_no,
    listed_price_cents: home.listed_price_cents ?? 0,
    setup_cents: home.setup_cents ?? null,
    setup_markup_pct: home.setup_markup_pct ?? null,
    include_setup_in_price: home.include_setup_in_price ?? null,
    addons_cents: home.addons_cents ?? null,
    addons_markup_pct: home.addons_markup_pct ?? null,
    addons_jsonb: home.addons_jsonb,
  });

  const quote = await createQuote({ leadId, orgId, homeId, lineItems, notes: [], draft: true });
  return { id: quote.id, public_token: quote.public_token };
}

/**
 * Add a home to a lead's shortlist (multi-assign) and auto-create a private
 * draft quote for it. Idempotent: re-assigning an already-assigned home is a
 * no-op (no duplicate row, no duplicate quote). Keeps `leads.home_id` pointed at
 * a "primary" home for the lead list / kanban / document defaults.
 */
export async function assignHomeToLead(
  leadId: string,
  homeId: string,
): Promise<{ homeId: string; quoteId: string | null; quoteToken: string | null; alreadyAssigned: boolean }> {
  const supabase = createClient();

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, org_id, home_id')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr || !lead) throw new Error(leadErr?.message ?? 'Lead not found');

  // Idempotent: already on the shortlist → return its existing draft quote.
  const { data: existing } = await supabase
    .from('lead_assigned_homes')
    .select('quote_id, quotes(public_token)')
    .eq('lead_id', leadId)
    .eq('home_id', homeId)
    .maybeSingle();
  if (existing) {
    const rel = (existing as { quotes?: { public_token: string } | { public_token: string }[] | null }).quotes;
    const token = (Array.isArray(rel) ? rel[0]?.public_token : rel?.public_token) ?? null;
    return { homeId, quoteId: existing.quote_id, quoteToken: token, alreadyAssigned: true };
  }

  // Insert the assignment first — the unique (lead_id, home_id) constraint is the
  // race gate, so a double-click can't spawn two draft quotes.
  const { error: insErr } = await supabase
    .from('lead_assigned_homes')
    .insert({ org_id: lead.org_id, lead_id: leadId, home_id: homeId });
  if (insErr) {
    if ((insErr as { code?: string }).code === '23505') {
      return { homeId, quoteId: null, quoteToken: null, alreadyAssigned: true };
    }
    throw new Error(insErr.message);
  }

  // Reuse an existing auto-draft for this home if one was left behind by a prior
  // assign → unassign (unassign keeps the quote on record). This avoids piling
  // up duplicate draft quotes when a home is toggled. Otherwise create a fresh
  // one. Only auto-drafts (visible_to_buyer = false) are candidates.
  let quote: { id: string; public_token: string } | null = null;
  const { data: orphanDraft } = await supabase
    .from('quotes')
    .select('id, public_token')
    .eq('lead_id', leadId)
    .eq('home_id', homeId)
    .eq('visible_to_buyer', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orphanDraft) {
    quote = { id: orphanDraft.id, public_token: orphanDraft.public_token };
  } else {
    try {
      quote = await createDraftQuoteForHome(leadId, lead.org_id, homeId);
    } catch (e) {
      console.error('[assign] draft quote creation failed:', e);
    }
  }
  if (quote) {
    await supabase
      .from('lead_assigned_homes')
      .update({ quote_id: quote.id })
      .eq('lead_id', leadId)
      .eq('home_id', homeId);
  }

  // Backward-compatible "primary" home for single-home consumers.
  if (!lead.home_id) {
    await supabase.from('leads').update({ home_id: homeId }).eq('id', leadId);
  }

  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  return {
    homeId,
    quoteId: quote?.id ?? null,
    quoteToken: quote?.public_token ?? null,
    alreadyAssigned: false,
  };
}

/**
 * Remove a home from a lead's shortlist. The auto-created draft quote is kept as
 * a record (just unlinked via the FK's `on delete set null`). Re-points the
 * "primary" `leads.home_id` to another assigned home if this one was primary.
 */
export async function unassignHomeFromLead(leadId: string, homeId: string): Promise<{ homeId: string }> {
  const supabase = createClient();

  const { error } = await supabase
    .from('lead_assigned_homes')
    .delete()
    .eq('lead_id', leadId)
    .eq('home_id', homeId);
  if (error) throw new Error(error.message);

  const { data: lead } = await supabase.from('leads').select('home_id').eq('id', leadId).maybeSingle();
  if (lead?.home_id === homeId) {
    const { data: next } = await supabase
      .from('lead_assigned_homes')
      .select('home_id')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    await supabase.from('leads').update({ home_id: next?.home_id ?? null }).eq('id', leadId);
  }

  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  return { homeId };
}
