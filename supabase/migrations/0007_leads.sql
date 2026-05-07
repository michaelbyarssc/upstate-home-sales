-- ============================================================================
-- 0007_leads.sql
-- Week 4-6: leads, lead_messages, quotes, trade_ins.
-- Round-robin assignment with manager override (Q2). Tracks SMS opt-in (Q3).
-- ============================================================================

-- ─── Enums ──────────────────────────────────────────────────────────────────
create type public.lead_source as enum (
  'quote_form', 'contact_form', 'phone', 'walkin', 'tradein', 'import'
);

create type public.lead_stage as enum (
  'new', 'in_progress', 'quoted', 'won', 'lost'
);

create type public.message_kind as enum (
  'inbound', 'outbound', 'note', 'system'
);

create type public.message_channel as enum (
  'email', 'sms', 'call'
);

-- ─── leads ──────────────────────────────────────────────────────────────────
create table public.leads (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  home_id             uuid references public.homes(id) on delete set null,

  contact_name        text not null,
  email               text,
  phone               text,

  source              public.lead_source not null,
  stage               public.lead_stage  not null default 'new',
  assignee_id         uuid references auth.users(id) on delete set null,
  is_hot              boolean not null default false,
  next_action         text,

  -- Per-thread token used for inbound email Reply-To routing in Week 5.
  reply_token         text not null unique default replace(gen_random_uuid()::text, '-', ''),

  -- TCPA consent (Q3).
  sms_consent         boolean not null default false,
  sms_consent_at      timestamptz,
  sms_consent_text    text,

  -- Free-form intake payload (qualifier answers, UTM, etc.).
  qualifier_payload   jsonb,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index leads_org_stage_idx     on public.leads (org_id, stage, created_at desc);
create index leads_assignee_idx      on public.leads (assignee_id) where assignee_id is not null;
create index leads_home_idx          on public.leads (home_id) where home_id is not null;
create index leads_email_idx         on public.leads (org_id, lower(email));

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.tg_set_updated_at();

-- ─── lead_messages (timeline) ───────────────────────────────────────────────
create table public.lead_messages (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  org_id        uuid not null references public.orgs(id) on delete cascade,
  kind          public.message_kind not null,
  channel       public.message_channel,
  author_id     uuid references auth.users(id) on delete set null,
  body          text not null,
  attachments   jsonb,
  -- Set by inbound webhooks (SendGrid/Twilio) for tracing.
  external_id   text,
  sent_at       timestamptz not null default now()
);

create index lead_messages_lead_idx on public.lead_messages (lead_id, sent_at);
create index lead_messages_org_idx  on public.lead_messages (org_id, sent_at desc);

-- ─── quotes ─────────────────────────────────────────────────────────────────
create table public.quotes (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs(id) on delete cascade,
  lead_id               uuid not null references public.leads(id) on delete cascade,
  home_id               uuid not null references public.homes(id) on delete restrict,
  -- Snapshotted at send time. Independent of homes.markup_pct changes after.
  listed_price_cents    bigint not null,
  addons_jsonb          jsonb,
  financing_jsonb       jsonb,
  pdf_storage_path      text,
  -- Public access via /q/[token].
  public_token          text not null unique
                        default replace(gen_random_uuid()::text, '-', ''),
  expires_at            timestamptz not null default (now() + interval '14 days'),
  created_by            uuid references auth.users(id),
  created_at            timestamptz not null default now()
);

create index quotes_lead_idx on public.quotes (lead_id, created_at desc);
create index quotes_org_idx  on public.quotes (org_id, created_at desc);

-- ─── trade_ins ──────────────────────────────────────────────────────────────
create table public.trade_ins (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  lead_id           uuid references public.leads(id) on delete set null,

  contact_name      text not null,
  email             text,
  phone             text,

  year              int,
  make              text,
  model             text,
  size_w            int,
  size_l            int,
  condition_notes   text,
  photos_paths      text[],

  offer_cents       bigint,
  status            text not null default 'submitted'
                    check (status in ('submitted', 'reviewed', 'offered', 'accepted', 'declined')),
  reviewed_by       uuid references auth.users(id),
  reviewed_at       timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index trade_ins_org_status_idx on public.trade_ins (org_id, status, created_at desc);

create trigger trade_ins_set_updated_at
  before update on public.trade_ins
  for each row execute function public.tg_set_updated_at();

-- ─── Round-robin assignment pointer (Q2) ────────────────────────────────────
-- Tracks the last-assigned sales user per org so the next intake can pick the
-- next one in the rotation. Maintained by the assign function.
create table public.lead_assignment_pointer (
  org_id           uuid primary key references public.orgs(id) on delete cascade,
  last_user_id     uuid references auth.users(id) on delete set null,
  last_assigned_at timestamptz
);

-- Picks the next sales-eligible user in the org for round-robin assignment.
-- Eligibility: org_member with active status and a role in (sales, manager, owner).
-- We never assign 'service' or 'readonly' users.
create or replace function public.pick_next_assignee(p_org_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_users     uuid[];
  v_last      uuid;
  v_idx       int;
  v_picked    uuid;
begin
  select array_agg(user_id order by user_id) into v_users
  from public.org_members
  where org_id = p_org_id
    and status = 'active'
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

-- ─── RLS · leads ────────────────────────────────────────────────────────────
alter table public.leads enable row level security;

create policy leads_select_member on public.leads
  for select to authenticated
  using (
    org_id = any(public.org_ids())
    and (public.active_org() is null or org_id = public.active_org())
  );

-- Updates: any sales+ member (manager override of assignee, status changes, etc.)
create policy leads_update_member on public.leads
  for update to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- Inserts come from the public lead-intake route running with the service
-- role; no INSERT policy for authenticated/anon (RLS denies by default).

-- ─── RLS · lead_messages ────────────────────────────────────────────────────
alter table public.lead_messages enable row level security;

create policy lead_messages_select_member on public.lead_messages
  for select to authenticated
  using (
    org_id = any(public.org_ids())
    and (public.active_org() is null or org_id = public.active_org())
  );

create policy lead_messages_insert_member on public.lead_messages
  for insert to authenticated
  with check (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  );

-- ─── RLS · quotes ───────────────────────────────────────────────────────────
alter table public.quotes enable row level security;

create policy quotes_select_member on public.quotes
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy quotes_modify_member on public.quotes
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- Public quote view (anon-readable by token, only non-expired).
create view public.public_quotes as
select
  q.public_token,
  q.lead_id,
  q.home_id,
  q.listed_price_cents,
  q.addons_jsonb,
  q.financing_jsonb,
  q.pdf_storage_path,
  q.expires_at,
  q.created_at,
  h.name        as home_name,
  h.stock_no,
  h.beds, h.baths, h.sqft,
  h.headline, h.description,
  o.name        as org_name,
  o.brand_color
from public.quotes q
join public.homes h on h.id = q.home_id
join public.orgs o on o.id = q.org_id
where q.expires_at > now();

grant select on public.public_quotes to anon, authenticated;

-- ─── RLS · trade_ins ────────────────────────────────────────────────────────
alter table public.trade_ins enable row level security;

create policy trade_ins_select_member on public.trade_ins
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy trade_ins_modify_member on public.trade_ins
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales','service']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- ─── Realtime ───────────────────────────────────────────────────────────────
-- Enable Realtime broadcasting for leads + lead_messages so the inbox can
-- subscribe via supabase.channel(...).on('postgres_changes', ...).
alter publication supabase_realtime add table public.leads;
alter publication supabase_realtime add table public.lead_messages;

-- ─── Audit triggers ─────────────────────────────────────────────────────────
create or replace function public.tg_leads_audit() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_audit(new.org_id, 'lead.created', 'leads', new.id, null, to_jsonb(new), null);
  elsif tg_op = 'UPDATE' then
    if new.assignee_id is distinct from old.assignee_id then
      perform public.emit_audit(new.org_id, 'lead.assignment.changed', 'leads', new.id,
        jsonb_build_object('assignee_id', old.assignee_id),
        jsonb_build_object('assignee_id', new.assignee_id), null);
    end if;
    if new.stage is distinct from old.stage then
      perform public.emit_audit(new.org_id, 'lead.stage.changed', 'leads', new.id,
        jsonb_build_object('stage', old.stage),
        jsonb_build_object('stage', new.stage), null);
    end if;
  end if;
  return new;
end;
$$;

create trigger leads_audit
  after insert or update on public.leads
  for each row execute function public.tg_leads_audit();
