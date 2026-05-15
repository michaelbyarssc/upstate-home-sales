import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { createServiceClient } from '@uhs/db/service';
import type { Lead, LeadCollaborator, LeadMessage, LeadMilestone } from '@uhs/db';
import { LeadDetailClient } from './detail-client';
import { BuyerPortalPanel } from './portal-panel';
import { buildDefaultLineItems } from '../../../../lib/default-line-items';
import '../leads.css';

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [leadRes, { data: messages }, { data: members }, { data: campaigns }, { data: enrollments }, { data: buyerLink }, { data: milestones }, { data: homesForSuggest }, collabRes, { data: quotes }] = await Promise.all([
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
      .select('id, name, stock_no, listed_price_cents')
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
      .select('id, home_id, listed_price_cents, expires_at, created_at, public_token, pdf_storage_path, homes(name, stock_no)')
      .eq('lead_id', params.id)
      .order('created_at', { ascending: false }),
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

  // Build default line items from home pricing for the quote/invoice modals.
  const homeRel = Array.isArray(lead.homes) ? lead.homes[0] : lead.homes;
  const defaultLineItems = homeRel
    ? buildDefaultLineItems(homeRel as any)
    : [];

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
        homes={(homesForSuggest ?? []) as Array<{ id: string; name: string; stock_no: string; listed_price_cents: number }>}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
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
    </>
  );
}
