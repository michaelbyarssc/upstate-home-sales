import { NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createServiceClient } from '@uhs/db/service';

/**
 * Phase H — natural-language inventory search.
 *
 * Takes a free-text query like "3 bed double-wide under 80k" and returns a
 * URL-encoded set of /inventory filters. Falls back to a simple ILIKE
 * search when the LLM isn't available or fails.
 */

export const runtime = 'nodejs';
export const maxDuration = 30;

const FilterSchema = z.object({
  beds: z.number().int().nullable().optional(),
  baths: z.number().nullable().optional(),
  type: z.enum(['single', 'double', 'modular']).nullable().optional(),
  max_price: z.number().int().positive().nullable().optional().describe('Max price in dollars'),
  min_sqft: z.number().int().positive().nullable().optional(),
  max_sqft: z.number().int().positive().nullable().optional(),
  q: z.string().nullable().optional().describe('Free-text fallback for name/model match'),
});

export async function POST(req: Request) {
  const { query, org_slug }: { query?: string; org_slug?: string } = await req.json();
  const text = (query ?? '').trim();
  if (!text) return NextResponse.json({ filters: {}, source: 'empty' });

  // Resolve org for logging.
  const sb = createServiceClient();
  let orgId: string | null = null;
  if (org_slug) {
    const { data } = await sb.from('orgs').select('id').eq('slug', org_slug).maybeSingle();
    orgId = data?.id ?? null;
  }
  if (!orgId) {
    const { data } = await sb.from('orgs').select('id').eq('status', 'active').order('created_at').limit(1).maybeSingle();
    orgId = data?.id ?? null;
  }

  let filters: z.infer<typeof FilterSchema> = {};
  let source: 'llm' | 'fallback' = 'fallback';

  try {
    const { object } = await generateObject({
      model: process.env.AI_CHAT_MODEL || 'anthropic/claude-sonnet-4-6',
      schema: FilterSchema,
      prompt: [
        'Convert this manufactured-home shopping query into structured filters.',
        'Examples:',
        '  "3 bed double-wide under 80k" → { beds: 3, type: "double", max_price: 80000 }',
        '  "modular at least 1500 sqft"  → { type: "modular", min_sqft: 1500 }',
        '  "singlewide cheap"            → { type: "single", max_price: 60000 }',
        'Set fields to null if not mentioned. Don\'t invent.',
        '',
        `Query: ${text}`,
      ].join('\n'),
    });
    filters = object;
    source = 'llm';
  } catch {
    // Fallback: use the raw text as a free-text q.
    filters = { q: text };
  }

  // Compute result count for the dealer's report.
  let resultCount = 0;
  if (orgId) {
    let query2 = sb.from('public_homes').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
    if (filters.beds != null) query2 = query2.gte('beds', filters.beds);
    if (filters.baths != null) query2 = query2.gte('baths', filters.baths);
    if (filters.type) query2 = query2.eq('type', filters.type);
    if (filters.max_price != null) query2 = query2.lte('listed_price_cents', filters.max_price * 100);
    if (filters.min_sqft != null) query2 = query2.gte('sqft', filters.min_sqft);
    if (filters.max_sqft != null) query2 = query2.lte('sqft', filters.max_sqft);
    if (filters.q) query2 = query2.or(`name.ilike.%${filters.q}%,model.ilike.%${filters.q}%`);
    const { count } = await query2;
    resultCount = count ?? 0;

    // Log the query for the AI report.
    void sb.from('nl_search_queries').insert({
      org_id: orgId,
      query_text: text,
      parsed_filters: filters,
      result_count: resultCount,
    });
  }

  return NextResponse.json({ filters, result_count: resultCount, source });
}
