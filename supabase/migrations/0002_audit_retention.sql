-- ============================================================================
-- 0002_audit_retention.sql
-- Audit ledger (Q5c) + retention scaffolding (Q5a, Q5b).
-- Single audit_events ledger. Insert-only via RLS. Purge job lives in 0004
-- (deferred — runs as service role, not as authenticated users).
-- ============================================================================

-- ─── audit_events ───────────────────────────────────────────────────────────
create table public.audit_events (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  actor_id        uuid references auth.users(id) on delete set null,
  -- Dotted, e.g. 'lead.assignment.changed', 'home.pricing.changed'.
  -- Text rather than enum so new event kinds don't require a migration.
  kind            text not null,
  subject_table   text not null,
  subject_id      uuid not null,
  before          jsonb,
  after           jsonb,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);

create index audit_events_org_created_idx
  on public.audit_events (org_id, created_at desc);

create index audit_events_subject_idx
  on public.audit_events (subject_table, subject_id);

create index audit_events_kind_idx
  on public.audit_events (org_id, kind, created_at desc);

alter table public.audit_events enable row level security;

-- Owners and managers can read their org's audit log.
create policy audit_events_select_admins on public.audit_events
  for select
  using (
    public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  );

-- Authenticated users in the org can insert events (writes flow through
-- triggers and edge fns under the user's JWT). No update/delete policy:
-- audit_events is append-only. Service role bypasses RLS for the purge job.
create policy audit_events_insert_member on public.audit_events
  for insert
  with check (
    org_id = any(public.org_ids())
    and (actor_id is null or actor_id = auth.uid())
  );

-- ─── purge_runs ─────────────────────────────────────────────────────────────
-- Compliance evidence: when did we run the retention purge, what did we delete.
create table public.purge_runs (
  id            uuid primary key default uuid_generate_v4(),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  -- jsonb of {table_name: row_count} for both soft-delete-overdue and
  -- 7-year-retention-overdue deletions in one run.
  summary       jsonb,
  errors        jsonb,
  triggered_by  text not null default 'scheduled'
                check (triggered_by in ('scheduled', 'manual'))
);

alter table public.purge_runs enable row level security;
-- No grants to authenticated. Service role only.

-- ─── Generic audit emitter ──────────────────────────────────────────────────
-- Used by per-table triggers in later migrations. Keeps the trigger bodies
-- short and the ledger format consistent.
create or replace function public.emit_audit(
  p_org_id        uuid,
  p_kind          text,
  p_subject_table text,
  p_subject_id    uuid,
  p_before        jsonb,
  p_after         jsonb,
  p_metadata      jsonb default null
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.audit_events
    (org_id, actor_id, kind, subject_table, subject_id, before, after, metadata)
  values
    (p_org_id, auth.uid(), p_kind, p_subject_table, p_subject_id, p_before, p_after, p_metadata);
end;
$$;

revoke all on function public.emit_audit(uuid, text, text, uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.emit_audit(uuid, text, text, uuid, jsonb, jsonb, jsonb) to authenticated;
