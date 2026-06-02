import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { createServiceClient } from '@uhs/db/service';
import type { BuyerDocument, Lead, LeadCollaborator, LeadMessage, LeadMilestone, LeadPreferences, LineItem } from '@uhs/db';
import { LeadDetailClient } from './detail-client';
import { RequirementsPanel } from './requirements-panel';
import { BuyerPortalPanel } from './portal-panel';
import { BuyerUploadsPanel } from './buyer-uploads-panel';
import { DealerDocsPanel, type DealerDocRow } from './dealer-docs-panel';
import { LeadSignDocsPanel } from './lead-sign-docs-panel';
import { buildDefaultLineItems } from '../../../../lib/default-line-items';
import { matchHomes, type MatchableHome } from '../../../../lib/match-homes';
import '../leads.css';

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [leadRes, { data: messages }, { data: members }, { data: campaigns }, { data: enrollments }, { data: buyerLink }, { data: milestones }, { data: homesForSuggest }, collabRes, { data: quotes }, { data: buyerUploads }, { data: invoicesData }, { data: posData }, { data: leadPrefs }, { data: manufacturers }, { data: homesForMatch }] = await Promise.all([
    supabase
      .from('leads')
      .select('*, homes(name, stock_no, listed_price_cents, setup_cents, setup_markup_pct, include_setup_in_price, addons_cents, addons_markup_pct, addons_jsonb)')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('lead_messages')
      .select('*')
      .eq('lead_id', params.id)
      .order('sent_at'),
    supabase
      .from('org_members')
      .select('user_id, role')
      .eq('status', 'active')
      .in('role', ['owner', 'manager', 'sales']),
    supabase
      .from('campaigns')
      .select('id, name, channel, status')
      .eq('status', 'active')
      .order('name'),
    supabase
      .from('campaign_enrollments')
      .select('id, campaign_id, status, current_step, next_send_at, campaigns(name, channel)')
      .eq('lead_id', params.id),
    supabase
      .from('buyer_lead_links')
      .select('buyer_id, status, buyers(full_name)')
      .eq('lead_id', params.id)
      .maybeSingle(),
    supabase
      .from('lead_milestones')
      .select('*')
      .eq('lead_id', params.id)
      .order('sort_order')
      .order('created_at'),
    supabase
      .from('homes')
      .select('id, name, stock_no, listed_price_cents, beds, baths, beds_options, baths_options, sqft')
      .is('deleted_at', null)
      .eq('status', 'published')
      .order('name')
      .limit(50),
    supabase
      .from('lead_collaborators')
      .select('*')
      .eq('lead_id', params.id)
      .order('created_at')
      .then((r) => ({ data: r.data }), () => ({ data: null })),
    supabase
      .from('quotes')
      .select('id, home_id, listed_price_cents, expires_at, created_at, public_token, pdf_storage_path, addons_jsonb, visible_to_buyer, homes(name, stock_no)')
      .eq('lead_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('buyer_documents')
      .select('id, kind, original_name, size_bytes, content_type, uploaded_at, storage_path, lead_id, org_id, buyer_id')
      .eq('lead_id', params.id)
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id, home_id, invoice_number, listed_price_cents, line_items_jsonb, due_at, created_at, public_token, pdf_storage_path, visible_to_buyer, homes(name, stock_no)')
      .eq('lead_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('purchase_orders')
      .select('id, home_id, po_number, listed_price_cents, line_items_jsonb, delivery_date, created_at, public_token, pdf_storage_path, visible_to_buyer, homes(name, stock_no)')
      .eq('lead_id', params.id)
      .order('created_at', { ascending: false }),
    // CRM buyer requirements + match candidates (0041).
    supabase
      .from('lead_preferences')
      .select('*')
      .eq('lead_id', params.id)
      .maybeSingle(),
    supabase
      .from('manufacturers')
      .select('id, name')
      .order('name'),
    supabase
      .from('homes')
      .select('id, name, stock_no, type, manufacturer_id, model, beds, beds_options, baths, baths_options, sqft, width_ft, length_ft, year_built, listed_price_cents, headline, description')
      .eq('status', 'published')
      .is('deleted_at', null),
  ]);
  const collaborators = collabRes?.data;

  // Suggestions count: only meaningful if we have a buyer link.
  let suggestionsCountFinal = 0;
  if (buyerLink?.buyer_id) {
    const { count } = await supabase
      .from('buyer_suggested_homes')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', buyerLink.buyer_id);
    suggestionsCountFinal = count ?? 0;
  }

  // Resolve collaborator + member profiles for display names
  const collabList = (collaborators ?? []) as LeadCollaborator[];
  const allUserIds = new Set([
    ...(members ?? []).map((m: any) => m.user_id),
    ...collabList.map((c) => c.user_id),
  ]);
  const memberProfiles: Record<string, { name: string | null; email: string | null }> = {};
  if (allUserIds.size > 0) {
    try {
      const sb = createServiceClient();
      const lookups = await Promise.all(
        Array.from(allUserIds).map(async (id) => {
          try {
            const { data } = await sb.auth.admin.getUserById(id);
            return { id, user: data?.user ?? null };
          } catch { return { id, user: null }; }
        }),
      );
      for (const { id, user } of lookups) {
        if (!user) continue;
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
        const name = (typeof meta.full_name === 'string' && meta.full_name) || null;
        memberProfiles[id] = { name, email: user.email ?? null };
      }
    } catch { /* service client unavailable */ }
  }

  if (leadRes.error) {
    console.error('[lead-detail] query error:', leadRes.error.message);
  }
  const lead = leadRes.data;
  if (!lead) notFound();

  // CRM: rank published inventory against the saved buyer requirements.
  const leadPreferences = (leadPrefs ?? null) as LeadPreferences | null;
  const initialMatches = leadPreferences
    ? matchHomes(leadPreferences, (homesForMatch ?? []) as unknown as MatchableHome[]).slice(0, 24)
    : [];

  // CRM: homes shortlisted to this lead (multi-assign) + their draft-quote tokens.
  // Degrades to empty if the 0042 migration hasn't been applied yet.
  const { data: assignedRows } = await supabase
    .from('lead_assigned_homes')
    .select('home_id, quote_id, quotes(public_token)')
    .eq('lead_id', params.id)
    .then((r) => ({ data: r.data }), () => ({ data: null }));
  const assignedHomeIds = ((assignedRows ?? []) as Array<{ home_id: string }>).map((a) => a.home_id);
  const assignedQuoteTokens: Record<string, string | null> = {};
  for (const a of (assignedRows ?? []) as Array<{
    home_id: string;
    quotes: { public_token: string } | { public_token: string }[] | null;
  }>) {
    const rel = a.quotes;
    assignedQuoteTokens[a.home_id] = (Array.isArray(rel) ? rel[0]?.public_token : rel?.public_token) ?? null;
  }

  // Build default line items from home pricing for the quote/invoice modals.
  const homeRel = Array.isArray(lead.homes) ? lead.homes[0] : lead.homes;
  const defaultLineItems = homeRel
    ? buildDefaultLineItems(homeRel as any)
    : [];

  // ── Document engine: active templates + this lead's document instances ──
  const [{ data: signTemplates }, { data: docInstances }] = await Promise.all([
    supabase.from('document_templates').select('id, name').eq('status', 'active').order('name'),
    supabase
      .from('document_instances')
      .select('id, doc_number, status, created_at, signed_pdf_path, public_token')
      .eq('lead_id', params.id)
      .order('created_at', { ascending: false }),
  ]);
  const instIds = ((docInstances ?? []) as Array<{ id: string }>).map((d) => d.id);
  const { data: signSessions } = instIds.length
    ? await supabase
        .from('signing_sessions')
        .select('instance_id, session_token, created_at')
        .in('instance_id', instIds)
        .order('created_at', { ascending: false })
    : { data: [] as Array<{ instance_id: string; session_token: string; created_at: string }> };
  const tokenByInstance = new Map<string, string>();
  for (const s of (signSessions ?? []) as Array<{ instance_id: string; session_token: string }>) {
    if (!tokenByInstance.has(s.instance_id)) tokenByInstance.set(s.instance_id, s.session_token);
  }
  const signInstances = ((docInstances ?? []) as Array<{ id: string; doc_number: number | null; status: string; created_at: string; signed_pdf_path: string | null; public_token: string | null }>).map(
    (d) => ({ ...d, session_token: tokenByInstance.get(d.id) ?? null }),
  );

  // Quotes the customer accepted & signed online → "Accepted online" badge.
  const quoteIds = ((quotes ?? []) as Array<{ id: string }>).map((q) => q.id);
  let signedQuoteIds = new Set<string>();
  if (quoteIds.length > 0) {
    const { data: sigs } = await supabase
      .from('quote_signatures')
      .select('quote_id')
      .in('quote_id', quoteIds);
    signedQuoteIds = new Set(((sigs ?? []) as Array<{ quote_id: string }>).map((s) => s.quote_id));
  }

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <Link href="/leads" style={{ color: 'var(--adm-ink-mute)', textDecoration: 'none', fontSize: 13 }}>
          ← Back to inbox
        </Link>
      </div>
      <LeadDetailClient
        lead={lead as Lead & { homes?: { name: string; stock_no: string; listed_price_cents: number } | null }}
        initialMessages={(messages ?? []) as LeadMessage[]}
        members={(members ?? []) as Array<{ user_id: string; role: string }>}
        memberProfiles={memberProfiles}
        campaigns={(campaigns ?? []) as Array<{ id: string; name: string; channel: string; status: string }>}
        initialEnrollments={(enrollments ?? []) as Array<{ id: string; campaign_id: string; status: string; current_step: number; next_send_at: string | null; campaigns?: { name: string; channel: string } | { name: string; channel: string }[] | null }>}
        initialCollaborators={collabList}
        initialQuotes={(quotes ?? []).map((q: any) => ({ ...q, homes: Array.isArray(q.homes) ? q.homes[0] ?? null : q.homes })) as Array<{ id: string; home_id: string; listed_price_cents: number; expires_at: string; created_at: string; public_token: string; pdf_storage_path: string | null; homes?: { name: string; stock_no: string } | null }>}
        defaultLineItems={defaultLineItems}
        homes={(homesForSuggest ?? []) as Array<{ id: string; name: string; stock_no: string; listed_price_cents: number; beds: number | null; baths: number | null; beds_options: number[] | null; baths_options: number[] | null; sqft: number | null }>}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
      />

      <RequirementsPanel
        leadId={params.id}
        initialPreferences={leadPreferences}
        manufacturers={(manufacturers ?? []) as Array<{ id: string; name: string }>}
        initialMatches={initialMatches}
        assignedHomeIds={assignedHomeIds}
        assignedQuoteTokens={assignedQuoteTokens}
        buyerLinked={!!buyerLink?.buyer_id}
      />

      <BuyerPortalPanel
        leadId={params.id}
        buyerLinked={!!buyerLink?.buyer_id}
        buyerName={
          (Array.isArray((buyerLink as any)?.buyers)
            ? (buyerLink as any).buyers[0]?.full_name
            : (buyerLink as any)?.buyers?.full_name) ?? null
        }
        homes={(homesForSuggest ?? []) as Array<{ id: string; name: string; stock_no: string }>}
        initialMilestones={(milestones ?? []) as LeadMilestone[]}
        initialSuggestionsCount={suggestionsCountFinal}
      />

      <DealerDocsPanel
        leadId={params.id}
        orgId={lead.org_id}
        homes={(homesForSuggest ?? []) as Array<{ id: string; name: string; stock_no: string; listed_price_cents: number; beds: number | null; baths: number | null; beds_options: number[] | null; baths_options: number[] | null; sqft: number | null }>}
        defaultLineItems={defaultLineItems}
        initialDocs={buildDealerDocs(quotes, invoicesData, posData, signedQuoteIds)}
      />

      <LeadSignDocsPanel
        leadId={params.id}
        templates={(signTemplates ?? []) as Array<{ id: string; name: string }>}
        instances={signInstances}
        publicBaseUrl={process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomecenter.com'}
      />

      <BuyerUploadsPanel initialUploads={(buyerUploads ?? []) as BuyerDocument[]} />
    </>
  );
}

function buildDealerDocs(
  quotes: any[] | null,
  invoices: any[] | null,
  pos: any[] | null,
  signedQuoteIds: Set<string>,
): DealerDocRow[] {
  const homeFrom = (r: any) => (Array.isArray(r?.homes) ? r.homes[0] : r?.homes) ?? null;

  const quoteRows: DealerDocRow[] = (quotes ?? []).map((q: any) => {
    const home = homeFrom(q);
    const items = Array.isArray(q.addons_jsonb) ? (q.addons_jsonb as LineItem[]) : [];
    return {
      kind: 'quote',
      id: q.id,
      title: `Quote · ${home?.name ?? 'Home'}${home?.stock_no ? ` (${home.stock_no})` : ''}`,
      homeId: q.home_id,
      homeName: home?.name ?? null,
      totalCents: q.listed_price_cents,
      createdAt: q.created_at,
      secondaryDate: q.expires_at,
      secondaryLabel: 'Expires',
      visibleToBuyer: q.visible_to_buyer ?? true,
      pdfStoragePath: q.pdf_storage_path,
      publicToken: q.public_token,
      publicHref: `/q/${q.public_token}`,
      lineItems: items,
      acceptedOnline: signedQuoteIds.has(q.id),
    };
  });

  const invoiceRows: DealerDocRow[] = (invoices ?? []).map((iv: any) => {
    const home = homeFrom(iv);
    const items = Array.isArray(iv.line_items_jsonb) ? (iv.line_items_jsonb as LineItem[]) : [];
    return {
      kind: 'invoice',
      id: iv.id,
      title: `Invoice #${iv.invoice_number} · ${home?.name ?? 'Home'}`,
      homeId: iv.home_id,
      homeName: home?.name ?? null,
      totalCents: iv.listed_price_cents,
      createdAt: iv.created_at,
      secondaryDate: iv.due_at,
      secondaryLabel: 'Due',
      visibleToBuyer: iv.visible_to_buyer ?? true,
      pdfStoragePath: iv.pdf_storage_path,
      publicToken: iv.public_token,
      publicHref: `/inv/${iv.public_token}`,
      lineItems: items,
    };
  });

  const poRows: DealerDocRow[] = (pos ?? []).map((po: any) => {
    const home = homeFrom(po);
    const items = Array.isArray(po.line_items_jsonb) ? (po.line_items_jsonb as LineItem[]) : [];
    return {
      kind: 'po',
      id: po.id,
      title: `PO #${po.po_number} · ${home?.name ?? 'Home'}`,
      homeId: po.home_id,
      homeName: home?.name ?? null,
      totalCents: po.listed_price_cents,
      createdAt: po.created_at,
      secondaryDate: po.delivery_date,
      secondaryLabel: 'Delivery',
      visibleToBuyer: po.visible_to_buyer ?? true,
      pdfStoragePath: po.pdf_storage_path,
      publicToken: po.public_token,
      publicHref: '',
      lineItems: items,
    };
  });

  return [...quoteRows, ...invoiceRows, ...poRows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
