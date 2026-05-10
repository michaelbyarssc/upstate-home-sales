-- ============================================================================
-- 0011_phase_a_crm.sql
-- Phase A: CRM & comms parity (Trove gap-close).
-- Adds:
--   • UTM/referrer/landing attribution columns on leads + reporting index
--   • org_members.in_rotation for round-robin opt-out + updated picker
--   • lead_stage_history (kanban audit + time-in-stage analytics)
--   • quote_signatures + public view + audit (e-sign on quotes)
--   • campaigns + campaign_steps + campaign_enrollments (drip email/SMS)
--   • workflow_rules + workflow_runs (event-triggered automations)
-- ============================================================================

-- ─── UTM attribution on leads ───────────────────────────────────────────────
alter table public.leads
  add column utm_source     text,
  add column utm_medium     text,
  add column utm_campaign   text,
  add column utm_term       text,
  add column utm_content    text,
  add column gclid          text,
  add column fbclid         text,
  add column referrer_url   text,
  add column landing_path   text;

create index leads_utm_source_idx on public.leads (org_id, utm_source, created_at desc)
  where utm_source is not null;
create index leads_utm_campaign_idx on public.leads (org_id, utm_campaign, created_at desc)
  where utm_campaign is not null;

-- ─── Round-robin opt-out per member ─────────────────────────────────────────
alter table public.org_members
  add column in_rotation boolean not null default true;

-- Updated picker honors the in_rotation flag. Same rotation pointer table.
create or replace function public.pick_next_assignee(p_org_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_users   uuid[];
  v_last    uuid;
  v_idx     int;
  v_picked  uuid;
begin
  select array_agg(user_id order by user_id) into v_users
  from public.org_members
  where org_id = p_org_id
    and status = 'active'
    and in_rotation = true
    and role in ('owner', 'manager', 'sales');

  if v_users is null or array_length(v_users, 1) = 0 then
    return null;
  end if;

  select last_user_id into v_last
  from public.lead_assignment_pointer where org_id = p_org_id;

  if v_last is null then
    v_picked := v_users[1];
  else
    v_idx := array_position(v_users, v_last);
    if v_idx is null or v_idx >= array_length(v_users, 1) then
      v_picked := v_users[1];
    else
      v_picked := v_users[v_idx + 1];
    end if;
  end if;

  insert into public.lead_assignment_pointer (org_id, last_user_id, last_assigned_at)
  values (p_org_id, v_picked, now())
  on conflict (org_id) do update set
    last_user_id = excluded.last_user_id,
    last_assigned_at = excluded.last_assigned_at;

  return v_picked;
end;
$$;

revoke all on function public.pick_next_assignee(uuid) from public;
grant execute on function public.pick_next_assignee(uuid) to service_role;

-- ─── Lead stage history (kanban + time-in-stage) ────────────────────────────
create table public.lead_stage_history (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  org_id      uuid not null references public.orgs(id) on delete cascade,
  from_stage  public.lead_stage,
  to_stage    public.lead_stage not null,
  changed_by  uuid references auth.users(id) on delete set null,
  changed_at  timestamptz not null default now(),
  reason      text
);

create index lead_stage_history_lead_idx on public.lead_stage_history (lead_id, changed_at desc);
create index lead_stage_history_org_idx  on public.lead_stage_history (org_id, changed_at desc);

create or replace function public.tg_lead_stage_history() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_stage_history (lead_id, org_id, from_stage, to_stage, changed_by)
    values (new.id, new.org_id, null, new.stage, auth.uid());
  elsif tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    insert into public.lead_stage_history (lead_id, org_id, from_stage, to_stage, changed_by)
    values (new.id, new.org_id, old.stage, new.stage, auth.uid());
  end if;
  return new;
end;
$$;

create trigger leads_stage_history
  after insert or update of stage on public.leads
  for each row execute function public.tg_lead_stage_history();

alter table public.lead_stage_history enable row level security;

create policy lead_stage_history_select_member on public.lead_stage_history
  for select to authenticated
  using (org_id = any(public.org_ids()));

-- ─── Quote signatures (e-sign acceptance) ───────────────────────────────────
create table public.quote_signatures (
  id                uuid primary key default gen_random_uuid(),
  quote_id          uuid not null references public.quotes(id) on delete cascade,
  org_id            uuid not null references public.orgs(id) on delete cascade,
  signer_name       text not null,
  signer_email      text not null,
  -- Path in storage to the rendered signature PNG (data URL captured client-side).
  signature_path    text not null,
  signer_ip         inet,
  signer_useragent  text,
  signed_at         timestamptz not null default now()
);

-- One signature per quote (idempotent re-sign updates the row via upsert in code).
create unique index quote_signatures_quote_uidx on public.quote_signatures (quote_id);
create index quote_signatures_org_idx on public.quote_signatures (org_id, signed_at desc);

alter table public.quote_signatures enable row level security;

create policy quote_signatures_select_member on public.quote_signatures
  for select to authenticated
  using (org_id = any(public.org_ids()));

-- Inserts/updates by service role only (signature endpoint runs server-side).

-- Public view: only signed_at + signer_name on the public quote page.
create view public.public_quote_signatures as
select
  q.public_token,
  s.signer_name,
  s.signed_at
from public.quote_signatures s
join public.quotes q on q.id = s.quote_id
where q.expires_at > now();

grant select on public.public_quote_signatures to anon, authenticated;

alter publication supabase_realtime add table public.quote_signatures;

create or replace function public.tg_quote_signed_audit() returns trigger
language plpgsql as $$
begin
  perform public.emit_audit(
    new.org_id, 'quote.signed', 'quotes', new.quote_id,
    null,
    jsonb_build_object('signer_name', new.signer_name, 'signer_email', new.signer_email),
    null
  );
  return new;
end;
$$;

create trigger quote_signatures_audit
  after insert on public.quote_signatures
  for each row execute function public.tg_quote_signed_audit();

-- ─── Campaigns (drip email + SMS) ──────────────────────────────────────────
create type public.campaign_channel as enum ('email', 'sms');
create type public.campaign_status as enum ('draft', 'active', 'paused', 'archived');
create type public.enrollment_status as enum ('active', 'completed', 'unsubscribed', 'errored');

create table public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  name            text not null,
  description     text,
  channel         public.campaign_channel not null,
  status          public.campaign_status not null default 'draft',
  -- Auto-enrollment: which event enrolls a lead into this campaign.
  -- Format: '<event>' or '<event>:<sub>' (e.g. 'lead.created', 'lead.stage.changed:quoted').
  -- null = manual enrollment only.
  trigger_event   text,
  -- JSON filter applied to the lead row at enrollment time.
  -- Example: { "source": "quote_form" } or { "utm_source": "google" }.
  trigger_filter  jsonb,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index campaigns_org_idx on public.campaigns (org_id, status);
create index campaigns_trigger_idx on public.campaigns (trigger_event)
  where trigger_event is not null and status = 'active';

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.tg_set_updated_at();

create table public.campaign_steps (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  org_id          uuid not null references public.orgs(id) on delete cascade,
  step_order      int not null,
  -- Delay relative to enrollment (step 1) or relative to previous step (step 2+).
  delay_seconds   bigint not null default 0,
  subject         text,           -- email only; null/ignored for sms
  body            text not null,  -- supports {{contact_name}}, {{home_name}}, {{org_name}}
  unique (campaign_id, step_order)
);

create index campaign_steps_campaign_idx on public.campaign_steps (campaign_id, step_order);

create table public.campaign_enrollments (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  org_id          uuid not null references public.orgs(id) on delete cascade,
  lead_id         uuid not null references public.leads(id) on delete cascade,
  status          public.enrollment_status not null default 'active',
  current_step    int not null default 0,        -- 0 = not yet sent any
  next_send_at    timestamptz,                   -- null when completed/errored
  enrolled_at     timestamptz not null default now(),
  completed_at    timestamptz,
  error_text      text,
  unique (campaign_id, lead_id)
);

create index campaign_enrollments_due_idx
  on public.campaign_enrollments (next_send_at)
  where status = 'active' and next_send_at is not null;
create index campaign_enrollments_lead_idx on public.campaign_enrollments (lead_id);

alter table public.campaigns enable row level security;
alter table public.campaign_steps enable row level security;
alter table public.campaign_enrollments enable row level security;

create policy campaigns_select_member on public.campaigns
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy campaigns_modify_managers on public.campaigns
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

create policy campaign_steps_select_member on public.campaign_steps
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy campaign_steps_modify_managers on public.campaign_steps
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

create policy campaign_enrollments_select_member on public.campaign_enrollments
  for select to authenticated
  using (org_id = any(public.org_ids()));

-- Inserts/updates of enrollments performed by the cron worker via service role.

-- ─── Workflow rules (event-triggered actions) ──────────────────────────────
-- Lightweight automation engine. Rules subscribe to events the app emits;
-- when an event fires, matching rules dispatch action(s).
--
-- Action types (run_workflow_action handles these):
--   { "type": "enroll_in_campaign", "campaign_id": "..." }
--   { "type": "assign_lead",        "user_id": "..." | "round_robin" }
--   { "type": "set_stage",          "stage": "in_progress" }
--   { "type": "tag",                "value": "vip" }       -- writes to qualifier_payload
--   { "type": "notify_email",       "to": "...", "template": "..." }

create type public.workflow_event as enum (
  'lead.created',
  'lead.stage.changed',
  'quote.sent',
  'quote.signed',
  'lead.message.received'
);

create table public.workflow_rules (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  name            text not null,
  enabled         boolean not null default true,
  event           public.workflow_event not null,
  -- Same shape as campaigns.trigger_filter: applied to event payload.
  filter          jsonb,
  -- Array of action descriptors (see comment above).
  actions         jsonb not null,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index workflow_rules_org_event_idx
  on public.workflow_rules (org_id, event)
  where enabled = true;

create trigger workflow_rules_set_updated_at
  before update on public.workflow_rules
  for each row execute function public.tg_set_updated_at();

create table public.workflow_runs (
  id              uuid primary key default gen_random_uuid(),
  rule_id         uuid not null references public.workflow_rules(id) on delete cascade,
  org_id          uuid not null references public.orgs(id) on delete cascade,
  event           public.workflow_event not null,
  payload         jsonb not null,
  status          text not null default 'pending'
                  check (status in ('pending', 'running', 'success', 'error', 'skipped')),
  result          jsonb,
  error_text      text,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index workflow_runs_rule_idx on public.workflow_runs (rule_id, created_at desc);
create index workflow_runs_status_idx on public.workflow_runs (status, created_at)
  where status in ('pending', 'running');

alter table public.workflow_rules enable row level security;
alter table public.workflow_runs enable row level security;

create policy workflow_rules_select_member on public.workflow_rules
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy workflow_rules_modify_managers on public.workflow_rules
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

create policy workflow_runs_select_member on public.workflow_runs
  for select to authenticated
  using (org_id = any(public.org_ids()));

-- Inserts/updates done by the dispatcher (service role).
