import { NextResponse } from 'next/server';
import { createServiceClient } from '@uhs/db/service';
import { parseSearchQuery, type ParsedSearch } from '../../../../lib/search-parser';

/**
 * Inventory search-query parser + dealer-side logging endpoint.
 *
 * Primary callers run the parser client-side (in SmartSearchBar) and POST
 * to this route fire-and-forget so the dealer's AI-search report keeps
 * receiving each query. If the client didn't pre-parse, we parse here.
 *
 * Tolerant of missing SUPABASE_SERVICE_ROLE_KEY in dev: returns the
 * parsed filters without logging in that case. Never 500s on env issues.
 */

export const runtime = 'nodejs';
export const maxDuration = 10;

type Body = {
  query?: string;
  filters?: ParsedSearch;
  org_slug?: string;
};

export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // Malformed JSON — treat as empty.
  }
  const text = (body.query ?? '').trim();
  if (!text) return NextResponse.json({ filters: {}, source: 'empty', result_count: 0 });

  // Best-effort service client. Missing env (dev) is OK — just skip logging.
  let sb: ReturnType<typeof createServiceClient> | null = null;
  try {
    sb = createServiceClient();
  } catch {
    sb = null;
  }

  let filters: ParsedSearch = body.filters ?? {};
  if (!body.filters) {
    let manufacturers: Array<{ slug: string; name: string }> = [];
    if (sb) {
      const { data } = await sb.from('manufacturers').select('slug, name');
      manufacturers = (data ?? []) as Array<{ slug: string; name: string }>;
    }
    filters = parseSearchQuery(text, manufacturers);
  }

  let resultCount = 0;
  if (sb) {
    // Resolve org for logging — same logic as before.
    let orgId: string | null = null;
    if (body.org_slug) {
      const { data } = await sb.from('orgs').select('id').eq('slug', body.org_slug).maybeSingle();
      orgId = data?.id ?? null;
    }
    if (!orgId) {
      const { data } = await sb
        .from('orgs')
        .select('id')
        .eq('status', 'active')
        .order('created_at')
        .limit(1)
        .maybeSingle();
      orgId = data?.id ?? null;
    }

    if (orgId) {
      let q = sb.from('public_homes').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
      if (filters.beds != null) q = q.or(`beds.eq.${filters.beds},beds_options.cs.{${filters.beds}}`);
      if (filters.baths != null) q = q.or(`baths.eq.${filters.baths},baths_options.cs.{${filters.baths}}`);
      if (filters.type) q = q.eq('type', filters.type);
      if (filters.mfr) {
        const { data: mfr } = await sb
          .from('manufacturers')
          .select('id')
          .eq('slug', filters.mfr)
          .maybeSingle();
        if (mfr?.id) q = q.eq('manufacturer_id', mfr.id);
      }
      if (filters.max_price != null) q = q.lte('listed_price_cents', filters.max_price * 100);
      if (filters.min_price != null) q = q.gte('listed_price_cents', filters.min_price * 100);
      if (filters.min_sqft != null) q = q.gte('sqft', filters.min_sqft);
      if (filters.max_sqft != null) q = q.lte('sqft', filters.max_sqft);
      if (filters.q) q = q.or(`name.ilike.%${filters.q}%,model.ilike.%${filters.q}%`);
      const { count } = await q;
      resultCount = count ?? 0;

      void sb.from('nl_search_queries').insert({
        org_id: orgId,
        query_text: text,
        parsed_filters: filters,
        result_count: resultCount,
      });
    }
  }

  return NextResponse.json({ filters, result_count: resultCount, source: 'parser' });
}
