'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@uhs/db/server';
import { createServiceClient } from '@uhs/db/service';
import type { LeadMessage, LeadStage, MessageChannel, MessageKind } from '@uhs/db';
import { sendEmail, sendSms } from '../../../../lib/notify';
import { renderQuotePdf, type QuotePdfData } from '../../../../lib/quote-pdf';
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
}): Promise<{ public_token: string; expires_at: string; listed_price_cents: number }> {
  const supabase = createClient();

  // Snapshot listed_price_cents from the home AT THIS MOMENT, plus full
  // home + lead + org context for the PDF and the customer email.
  const [{ data: home, error: hErr }, { data: lead }, { data: org }] = await Promise.all([
    supabase
      .from('homes')
      .select('id, name, stock_no, beds, baths, sqft, headline, description, listed_price_cents')
      .eq('id', args.homeId)
      .maybeSingle(),
    supabase
      .from('leads')
      .select('contact_name, email, reply_token')
      .eq('id', args.leadId)
      .maybeSingle(),
    supabase
      .from('orgs')
      .select('name, brand_color')
      .eq('id', args.orgId)
      .maybeSingle(),
  ]);
  if (hErr || !home) throw new Error(hErr?.message ?? 'Home not found');

  const expires = new Date(Date.now() + (args.validDays ?? 14) * 86_400_000).toISOString();

  const { data: quote, error } = await supabase
    .from('quotes')
    .insert({
      org_id: args.orgId,
      lead_id: args.leadId,
      home_id: args.homeId,
      listed_price_cents: home.listed_price_cents,
      expires_at: expires,
    })
    .select('id, public_token, expires_at, listed_price_cents, created_at')
    .single();
  if (error || !quote) throw new Error(error?.message ?? 'Quote insert failed');

  // Advance lead stage to 'quoted'.
  await supabase.from('leads').update({ stage: 'quoted' }).eq('id', args.leadId);

  const publicBase = process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomecenter.com';
  const publicUrl = `${publicBase}/q/${quote.public_token}`;

  // Render PDF, upload to Storage, persist the path. Best-effort: a PDF
  // failure shouldn't block the quote creation — the public URL still works.
  let signedPdfUrl: string | null = null;
  try {
    const pdfData: QuotePdfData = {
      orgName: org?.name ?? 'Upstate Home Sales',
      brandColor: org?.brand_color ?? null,
      homeName: home.name,
      stockNo: home.stock_no,
      beds: home.beds ?? null,
      baths: home.baths ?? null,
      sqft: home.sqft ?? null,
      headline: home.headline ?? null,
      description: home.description ?? null,
      listedPriceCents: quote.listed_price_cents,
      expiresAt: quote.expires_at,
      createdAt: quote.created_at,
      publicUrl,
    };
    const buf = await renderQuotePdf(pdfData);
    const path = `${args.orgId}/${quote.id}.pdf`;
    // Service client bypasses RLS — upload happens under a server action so
    // the user's session-bound client lacks insert privs on storage.objects.
    const svc = createServiceClient();
    const { error: upErr } = await svc.storage
      .from('quote-pdfs')
      .upload(path, buf, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw upErr;
    await supabase.from('quotes').update({ pdf_storage_path: path }).eq('id', quote.id);

    const { data: signed, error: signErr } = await svc.storage
      .from('quote-pdfs')
      .createSignedUrl(path, 60 * 60 * 24 * 7); // 7-day expiry per handoff §07
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

  // Email the customer if we have an address.
  if (lead?.email) {
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
