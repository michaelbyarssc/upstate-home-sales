import { streamText, tool, convertToModelMessages, type UIMessage } from 'ai';
import { z } from 'zod';
import { createServiceClient } from '@uhs/db/service';
import { absoluteUrl } from '../../../../lib/seo';

/**
 * Phase H — public AI chatbot endpoint.
 *
 * Streams responses via Vercel AI SDK + AI Gateway. Provider is selected by
 * the plain `provider/model` string so we can swap models without changing
 * imports. Default is `anthropic/claude-sonnet-4-6` (modern, cheap, good
 * tool-use), overridable per-org in a future iteration.
 *
 * Auth: anon. Org_id is resolved from the request body (`org_slug` from
 * widget) or defaulted to the first active org.
 *
 * Tools the model can call:
 *   - searchInventory(filters) — runs against public_homes view
 *   - getHomeDetail(stock_no) — single home
 *   - captureContact(name, email, phone, interest) — creates a lead
 *
 * Cost guardrail: tracks tokens_used per session; returns 429 once the
 * org's daily cap is exhausted.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6';

function pickModel(): string {
  return process.env.AI_CHAT_MODEL || DEFAULT_MODEL;
}

type ChatRequestBody = {
  messages?: UIMessage[];
  org_slug?: string;
  session_id?: string;
};

export async function POST(req: Request) {
  const { messages, org_slug, session_id }: ChatRequestBody = await req.json();
  if (!messages || messages.length === 0) {
    return new Response('No messages', { status: 400 });
  }

  const sb = createServiceClient();

  // Resolve org.
  let org: { id: string; name: string; ai_chat_enabled: boolean; ai_daily_token_cap: number; faq_markdown: string | null } | null = null;
  if (org_slug) {
    const { data } = await sb
      .from('orgs')
      .select('id, name, ai_chat_enabled, ai_daily_token_cap, faq_markdown')
      .eq('slug', org_slug)
      .maybeSingle();
    org = data;
  }
  if (!org) {
    const { data } = await sb
      .from('orgs')
      .select('id, name, ai_chat_enabled, ai_daily_token_cap, faq_markdown')
      .eq('status', 'active')
      .order('created_at')
      .limit(1)
      .maybeSingle();
    org = data;
  }
  if (!org) return new Response('No org configured', { status: 500 });
  if (!org.ai_chat_enabled) {
    return new Response('AI chat is disabled for this org', { status: 403 });
  }

  // Cost cap: count today's token usage across the org.
  if (org.ai_daily_token_cap > 0) {
    const sinceMidnight = new Date();
    sinceMidnight.setUTCHours(0, 0, 0, 0);
    const { data: usage } = await sb
      .from('chat_messages')
      .select('tokens_used')
      .eq('org_id', org.id)
      .gte('created_at', sinceMidnight.toISOString());
    const total = (usage ?? []).reduce((sum, m) => sum + (m.tokens_used ?? 0), 0);
    if (total >= org.ai_daily_token_cap) {
      return new Response(
        'Daily AI token cap exceeded. Try again tomorrow, or contact us via the form.',
        { status: 429 },
      );
    }
  }

  // Upsert chat session.
  let sessionId = session_id ?? null;
  if (!sessionId) {
    const { data: newSession } = await sb
      .from('chat_sessions')
      .insert({ org_id: org.id, message_count: messages.length })
      .select('id')
      .single();
    sessionId = newSession?.id ?? null;
  } else {
    await sb.from('chat_sessions').update({ message_count: messages.length }).eq('id', sessionId);
  }

  // System prompt — anchored on the dealer + invitations to use tools.
  const systemPrompt = [
    `You are a helpful sales assistant for ${org.name}, a manufactured-home dealer in South Carolina.`,
    'Help shoppers find a home that fits their needs (beds, budget, layout, lot type).',
    'Use the searchInventory tool when they describe filters. Use getHomeDetail when they ask about a specific stock number.',
    'When the shopper signals real interest (asks about pricing, financing, or wants to see one in person), invite them to share their name, email, and phone — then call captureContact.',
    'Be concise. Don\'t invent inventory or prices.',
    org.faq_markdown ? `\n\n## FAQ context\n${org.faq_markdown}` : '',
  ].join(' ');

  const result = streamText({
    model: pickModel(),
    system: systemPrompt,
    messages: convertToModelMessages(messages),
    tools: {
      searchInventory: tool({
        description: 'Search the dealer\'s published inventory by filters. Returns up to 10 matching homes.',
        inputSchema: z.object({
          beds: z.number().int().nullable().optional(),
          baths: z.number().nullable().optional(),
          type: z.enum(['single', 'double', 'modular']).nullable().optional(),
          max_price: z.number().int().positive().nullable().optional().describe('Max listed price in dollars'),
          min_sqft: z.number().int().positive().nullable().optional(),
          max_sqft: z.number().int().positive().nullable().optional(),
        }),
        execute: async (filters) => {
          let q = sb.from('public_homes')
            .select('id, stock_no, name, beds, baths, sqft, type, listed_price_cents, prices_hidden')
            .eq('org_id', org!.id);
          if (filters.beds != null) q = q.gte('beds', filters.beds);
          if (filters.baths != null) q = q.gte('baths', filters.baths);
          if (filters.type) q = q.eq('type', filters.type);
          if (filters.max_price != null) q = q.lte('listed_price_cents', filters.max_price * 100);
          if (filters.min_sqft != null) q = q.gte('sqft', filters.min_sqft);
          if (filters.max_sqft != null) q = q.lte('sqft', filters.max_sqft);
          const { data } = await q.limit(10);
          return (data ?? []).map((h: { id: string; stock_no: string; name: string; beds: number | null; baths: number | null; sqft: number | null; listed_price_cents: number | null; prices_hidden: boolean }) => ({
            stock_no: h.stock_no,
            name: h.name,
            beds: h.beds,
            baths: h.baths,
            sqft: h.sqft,
            price: h.prices_hidden || !h.listed_price_cents ? 'Contact for pricing' : `$${Math.round(h.listed_price_cents / 100).toLocaleString()}`,
            url: absoluteUrl(`/inventory/${encodeURIComponent(h.stock_no)}`),
          }));
        },
      }),
      getHomeDetail: tool({
        description: 'Look up a single home by stock number for full specs.',
        inputSchema: z.object({ stock_no: z.string().min(1) }),
        execute: async ({ stock_no }) => {
          const { data } = await sb
            .from('public_homes')
            .select('stock_no, name, type, beds, baths, sqft, width_ft, length_ft, year_built, headline, description, listed_price_cents, prices_hidden')
            .eq('org_id', org!.id)
            .eq('stock_no', stock_no)
            .maybeSingle();
          if (!data) return { error: 'Not found' };
          const d = data as { stock_no: string; name: string; type: string; beds: number | null; baths: number | null; sqft: number | null; width_ft: number | null; length_ft: number | null; year_built: number | null; headline: string | null; description: string | null; listed_price_cents: number | null; prices_hidden: boolean };
          return {
            ...d,
            price: d.prices_hidden || !d.listed_price_cents ? 'Contact for pricing' : `$${Math.round(d.listed_price_cents / 100).toLocaleString()}`,
            url: absoluteUrl(`/inventory/${encodeURIComponent(d.stock_no)}`),
          };
        },
      }),
      captureContact: tool({
        description: 'Capture buyer contact info as a new lead. Only call after the buyer has shared their name + email + phone.',
        inputSchema: z.object({
          name: z.string().min(1),
          email: z.string().email(),
          phone: z.string().min(7),
          interest: z.string().optional().describe('What the buyer is looking for'),
          stock_no: z.string().optional(),
        }),
        execute: async (args) => {
          // Reuse the shared lead-intake by calling the same insert path.
          let homeId: string | null = null;
          if (args.stock_no) {
            const { data: home } = await sb
              .from('homes')
              .select('id')
              .eq('org_id', org!.id)
              .eq('stock_no', args.stock_no)
              .maybeSingle();
            homeId = home?.id ?? null;
          }
          const { data: lead } = await sb
            .from('leads')
            .insert({
              org_id: org!.id,
              home_id: homeId,
              contact_name: args.name,
              email: args.email,
              phone: args.phone,
              source: 'quote_form',
              stage: 'new',
              sms_consent: false,
              qualifier_payload: { source: 'ai_chat', interest: args.interest ?? null },
            })
            .select('id')
            .single();

          // Mark the chat session as having captured a lead.
          if (sessionId && lead?.id) {
            await sb.from('chat_sessions')
              .update({ lead_captured: true, lead_id: lead.id })
              .eq('id', sessionId);
          }

          return { ok: true, message: `Lead captured for ${args.name}. A salesperson will reach out within one business day.` };
        },
      }),
    },
    onFinish: async ({ usage, text, toolCalls }) => {
      // Log assistant message + token use to chat_messages for the cost cap.
      if (sessionId) {
        const tokensUsed = usage?.totalTokens ?? 0;
        await sb.from('chat_messages').insert({
          session_id: sessionId,
          org_id: org!.id,
          role: 'assistant',
          content: text,
          tool_calls: toolCalls?.length
            ? toolCalls.map((tc) => ({ name: tc.toolName, args: tc.input as Record<string, unknown> }))
            : null,
          tokens_used: tokensUsed,
        });
        // Increment session counters. Using a select-then-update because
        // Supabase JS doesn't support atomic raw SQL increments.
        const { data: prev } = await sb
          .from('chat_sessions')
          .select('tokens_used')
          .eq('id', sessionId)
          .maybeSingle();
        await sb
          .from('chat_sessions')
          .update({ tokens_used: (prev?.tokens_used ?? 0) + tokensUsed })
          .eq('id', sessionId);
      }
    },
  });

  // Echo the most recent user message into chat_messages so the transcript is complete.
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (sessionId && lastUser) {
    const text = lastUser.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('\n');
    if (text) {
      await sb.from('chat_messages').insert({
        session_id: sessionId,
        org_id: org.id,
        role: 'user',
        content: text,
      });
    }
  }

  return result.toUIMessageStreamResponse({
    headers: sessionId ? { 'X-Session-Id': sessionId } : {},
  });
}
