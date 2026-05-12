-- ============================================================================
-- 0023_design_links_marketplace_event.sql
-- PR 1 carryover:
--   * Phase C — link a lead/quote back to the home_design that inspired it,
--     so a buyer's design → quote conversion preserves provenance.
--   * Phase I — add 'marketplace_view' to visitor_event_kind so /api/track
--     can fire a single client event that lands in both visitor_events and
--     marketplace_views.
-- ============================================================================

-- ─── Design → lead/quote link ────────────────────────────────────────────────
alter table public.leads
  add column if not exists source_design_id uuid references public.home_designs(id) on delete set null;

create index if not exists leads_source_design_idx
  on public.leads (source_design_id)
  where source_design_id is not null;

alter table public.quotes
  add column if not exists design_id uuid references public.home_designs(id) on delete set null;

create index if not exists quotes_design_idx
  on public.quotes (design_id)
  where design_id is not null;

-- ─── Marketplace event kind ──────────────────────────────────────────────────
-- ADD VALUE is idempotent in PG 12+. Done outside an explicit BEGIN/COMMIT
-- because some hosted Postgres versions still refuse to commit the new value
-- inside the same transaction it was created in. Supabase's migration runner
-- handles this correctly.
alter type public.visitor_event_kind add value if not exists 'marketplace_view';
