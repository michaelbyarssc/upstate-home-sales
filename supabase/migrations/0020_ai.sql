-- ============================================================================
-- 0020_ai.sql
-- Phase H: AI chatbot + natural-language inventory search.
--
-- Adds the schema for:
--   - chat_sessions / chat_messages: per-org chatbot transcripts, with
--     optional lead_id link when the bot captures contact info.
--   - nl_search_queries: log of free-text inventory searches that the AI
--     parsed into structured filters. Powers the /admin/reports/ai trends.
--   - orgs.ai_chat_enabled, orgs.ai_daily_token_cap, orgs.faq_markdown:
--     per-org toggle + cost guardrail + system-prompt FAQ.
-- ============================================================================

-- ─── orgs extensions ───────────────────────────────────────────────────────
alter table public.orgs
  add column if not exists ai_chat_enabled boolean not null default false,
  add column if not exists ai_daily_token_cap int not null default 100000 check (ai_daily_token_cap > 0),
  add column if not exists faq_markdown text;

-- ─── chat_sessions ─────────────────────────────────────────────────────────
create table public.chat_sessions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  -- Anonymous-session id from the public-site cookie. Multiple sessions can
  -- share a session_id if the user closes/reopens the chat.
  visitor_session_id  text,
  lead_id         uuid references public.leads(id) on delete set null,
  buyer_id        uuid references public.buyers(id) on delete set null,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  message_count   int not null default 0,
  -- True when the bot fired the captureContact tool successfully.
  lead_captured   boolean not null default false,
  -- Cumulative token usage (sum of chat_messages.tokens_used) for the cost cap.
  tokens_used     int not null default 0
);

create index chat_sessions_org_idx on public.chat_sessions (org_id, started_at desc);
create index chat_sessions_lead_idx on public.chat_sessions (lead_id) where lead_id is not null;

alter table public.chat_sessions enable row level security;

create policy chat_sessions_select_member on public.chat_sessions
  for select to authenticated
  using (org_id = any(public.org_ids()));

-- ─── chat_messages ─────────────────────────────────────────────────────────
create type public.chat_role as enum ('system', 'user', 'assistant', 'tool');

create table public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.chat_sessions(id) on delete cascade,
  org_id          uuid not null references public.orgs(id) on delete cascade,
  role            public.chat_role not null,
  content         text,
  -- Captured tool calls (if any) when role='assistant'. Schema:
  --   [ { name: string, args: object, result?: object } ]
  tool_calls      jsonb,
  tokens_used     int not null default 0,
  created_at      timestamptz not null default now()
);

create index chat_messages_session_idx on public.chat_messages (session_id, created_at);
create index chat_messages_org_idx on public.chat_messages (org_id, created_at desc);

alter table public.chat_messages enable row level security;

create policy chat_messages_select_member on public.chat_messages
  for select to authenticated
  using (org_id = any(public.org_ids()));

-- ─── nl_search_queries ─────────────────────────────────────────────────────
create table public.nl_search_queries (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  query_text      text not null,
  -- Output of the LLM parse — Zod-validated by the route handler before insert.
  parsed_filters  jsonb,
  result_count    int not null default 0,
  -- If the user clicked a home from the results, log it for click-through analysis.
  clicked_home_id uuid references public.homes(id) on delete set null,
  occurred_at     timestamptz not null default now()
);

create index nl_search_queries_org_idx on public.nl_search_queries (org_id, occurred_at desc);

alter table public.nl_search_queries enable row level security;

create policy nl_search_queries_select_member on public.nl_search_queries
  for select to authenticated
  using (org_id = any(public.org_ids()));

-- ─── Realtime ──────────────────────────────────────────────────────────────
-- Admins can watch active chats arrive in real time on /admin/reports/ai.
alter publication supabase_realtime add table public.chat_sessions;
alter publication supabase_realtime add table public.chat_messages;
