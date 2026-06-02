'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createServiceClient } from '@uhs/db/service';
import { QUOTE_PDF_BUCKET } from '@uhs/db';
import { dispatchWorkflowEvent } from '../../../lib/workflows';

type SignArgs = {
  token: string;
  signer_name: string;
  signer_email: string;
  /** data:image/png;base64,... */
  signature_data_url: string;
};

/**
 * Public quote signing endpoint. Anon-callable via the public quote page.
 *
 * Looks up the quote by `public_token`, validates non-expiry, decodes the
 * signature image data URL, uploads to the quote-pdfs bucket under
 * `signatures/`, and inserts into `quote_signatures`. The audit trigger on
 * `quote_signatures` fires automatically.
 *
 * Service role is required because anon does not have INSERT on quote_signatures.
 */
export async function signQuote(args: SignArgs): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = args.signer_name?.trim() ?? '';
  const email = args.signer_email?.trim().toLowerCase() ?? '';
  if (!name || name.length < 2) return { ok: false, error: 'Please enter your full name.' };
  if (!email || !email.includes('@')) return { ok: false, error: 'Please enter a valid email.' };
  if (!args.signature_data_url?.startsWith('data:image/png;base64,')) {
    return { ok: false, error: 'Signature is missing.' };
  }

  const sb = createServiceClient();

  const { data: quote, error: qErr } = await sb
    .from('quotes')
    .select('id, org_id, expires_at')
    .eq('public_token', args.token)
    .maybeSingle();
  if (qErr || !quote) return { ok: false, error: 'Quote not found.' };
  if (new Date(quote.expires_at) <= new Date()) {
    return { ok: false, error: 'This quote has expired.' };
  }

  // Decode the PNG. Reject if too large to keep storage bounded.
  const b64 = args.signature_data_url.slice('data:image/png;base64,'.length);
  const buf = Buffer.from(b64, 'base64');
  if (buf.length === 0) return { ok: false, error: 'Signature image is empty.' };
  if (buf.length > 200_000) return { ok: false, error: 'Signature image is too large.' };

  const path = `signatures/${quote.id}.png`;
  const { error: upErr } = await sb.storage
    .from(QUOTE_PDF_BUCKET)
    .upload(path, buf, { contentType: 'image/png', upsert: true });
  if (upErr) return { ok: false, error: `Storage upload failed: ${upErr.message}` };

  const hdrs = headers();
  const ip =
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    hdrs.get('x-real-ip') ||
    null;
  const userAgent = hdrs.get('user-agent') ?? null;

  const { error: sigErr } = await sb
    .from('quote_signatures')
    .upsert(
      {
        quote_id: quote.id,
        org_id: quote.org_id,
        signer_name: name,
        signer_email: email,
        signature_path: path,
        signer_ip: ip,
        signer_useragent: userAgent,
        signed_at: new Date().toISOString(),
      },
      { onConflict: 'quote_id' },
    );
  if (sigErr) return { ok: false, error: `Signature record failed: ${sigErr.message}` };

  // System message on the lead timeline so the dealer sees the signature event.
  const { data: leadRef } = await sb
    .from('quotes')
    .select('lead_id, home_id, listed_price_cents, addons_jsonb')
    .eq('id', quote.id)
    .maybeSingle();
  if (leadRef?.lead_id) {
    await sb.from('lead_messages').insert({
      lead_id: leadRef.lead_id,
      org_id: quote.org_id,
      kind: 'system',
      channel: null,
      body: `Quote signed by ${name} (${email}).`,
    });

    // Customer approved online → auto-create the invoice from the quote.
    // Idempotent: only if no invoice exists yet for this quote. The invoice PDF
    // renders on demand (admin /api/pdf/invoice/[id]) so no PDF render is needed
    // here in the public app.
    try {
      const { data: existing } = await sb
        .from('invoices')
        .select('id')
        .eq('quote_id', quote.id)
        .limit(1)
        .maybeSingle();
      if (!existing && leadRef.home_id) {
        const { data: nextNum } = await sb.rpc('next_invoice_number', { p_org_id: quote.org_id });
        const lineItems = Array.isArray(leadRef.addons_jsonb) ? leadRef.addons_jsonb : [];
        const { data: inv, error: invErr } = await sb
          .from('invoices')
          .insert({
            org_id: quote.org_id,
            lead_id: leadRef.lead_id,
            home_id: leadRef.home_id,
            quote_id: quote.id,
            invoice_number: (nextNum as number) ?? 1,
            listed_price_cents: leadRef.listed_price_cents,
            line_items_jsonb: lineItems,
          })
          .select('invoice_number')
          .single();
        if (invErr) {
          console.error('[sign-quote] invoice auto-create failed:', invErr.message);
        } else if (inv) {
          await sb.from('lead_messages').insert({
            lead_id: leadRef.lead_id,
            org_id: quote.org_id,
            kind: 'system',
            channel: null,
            body: `Invoice #${inv.invoice_number} auto-created from the accepted quote.`,
          });
        }
      }
    } catch (e) {
      console.error('[sign-quote] invoice auto-create error:', e);
    }
  }

  await dispatchWorkflowEvent({
    event: 'quote.signed',
    orgId: quote.org_id,
    payload: {
      quote_id: quote.id,
      lead_id: leadRef?.lead_id ?? null,
      signer_name: name,
      signer_email: email,
    },
  }).catch((e) => console.error('[sign-quote] workflow dispatch failed:', e));

  revalidatePath(`/q/${args.token}`);
  return { ok: true };
}
