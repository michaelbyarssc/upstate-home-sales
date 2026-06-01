-- ============================================================================
-- 0041_lead_preferences.sql
-- CRM buyer requirements: what kind of home a lead is looking for. One row per
-- lead. Drives the inventory matcher in the admin and (via the new `requested.*`
-- document bindings) can be printed onto a sales order / contract template.
--
-- Conventions mirror 0007_leads.sql: org_id FK + cascade, RLS via
-- public.org_ids()/has_role_in(), tg_set_updated_at(), and realtime publication.
-- Small vocabularies use text + check (precedent: trade_ins.status) rather than
-- new enums, to stay easy to evolve. preferred_types reuses public.home_type.
-- ============================================================================

create table public.lead_preferences (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs(id) on delete cascade,
  lead_id               uuid not null unique references public.leads(id) on delete cascade,

  -- Type & make (multi-select; arrays so "single OR double" is expressible)
  -- EV500SC field mappings noted inline.
  preferred_types       public.home_type[],          -- single / double / modular
  condition             text check (condition in ('new','used','either')),  -- EV500SC: THIS UNIT IS NEW/USED
  manufacturer_ids      uuid[],                       -- → manufacturers.id (validated app-side); EV500SC: MAKE
  preferred_models      text[],                       -- EV500SC: MODEL
  preferred_colors      text[],                       -- EV500SC: COLOR

  -- Size / layout ranges (null bound = no constraint on that side).
  -- EV500SC: BEDROOMS, BATHS, FLOOR SIZE (W×L → width/length), derived sqft, YEAR.
  min_beds              int,
  max_beds              int,
  min_baths             numeric(3,1),
  max_baths             numeric(3,1),
  min_sqft              int,
  max_sqft              int,
  min_width_ft          int,
  max_width_ft          int,
  min_length_ft         int,
  max_length_ft         int,
  min_year              int,
  max_year              int,

  -- Budget (cents, matching the pricing convention used across the schema).
  -- EV500SC: BASE PRICE OF UNIT / CASH PURCHASE PRICE.
  min_price_cents       bigint,
  max_price_cents       bigint,

  -- Features
  must_have_features    text[],                       -- the customer's non-negotiables
  nice_to_have_features text[],

  -- Qualification context
  timeline              text check (timeline in
                          ('asap','1_3_months','3_6_months','6_12_months','exploring')),
  land_status           text check (land_status in
                          ('owns_land','needs_land','in_park','unsure')),
  financing             text check (financing in ('cash','financing','unsure')),
  trade_in_interest     boolean not null default false,
  notes                 text,

  -- Audit
  created_by            uuid references auth.users(id),
  updated_by            uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index lead_preferences_org_idx on public.lead_preferences (org_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.lead_preferences enable row level security;

-- Read: any active org member (matches leads_select_member).
create policy lead_preferences_select_member on public.lead_preferences
  for select to authenticated
  using (
    org_id = any(public.org_ids())
    and (public.active_org() is null or org_id = public.active_org())
  );

-- Insert/Update/Delete: sales+ (matches quotes_modify_member).
create policy lead_preferences_modify_member on public.lead_preferences
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  );

-- ─── updated_at + actor fill ─────────────────────────────────────────────────
create trigger lead_preferences_set_updated_at
  before update on public.lead_preferences
  for each row execute function public.tg_set_updated_at();

-- Reusable created_by/updated_by filler (generic version of tg_homes_actor).
create or replace function public.tg_set_actor()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, auth.uid());
  elsif tg_op = 'UPDATE' then
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$$;

create trigger lead_preferences_actor
  before insert or update on public.lead_preferences
  for each row execute function public.tg_set_actor();

-- ─── Audit (parity with tg_leads_audit) ──────────────────────────────────────
create or replace function public.tg_lead_preferences_audit()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_audit(new.org_id, 'lead.preferences.created',
      'lead_preferences', new.id, null, to_jsonb(new), null);
  elsif tg_op = 'UPDATE' then
    perform public.emit_audit(new.org_id, 'lead.preferences.updated',
      'lead_preferences', new.id, to_jsonb(old), to_jsonb(new), null);
  end if;
  return new;
end;
$$;

create trigger lead_preferences_audit
  after insert or update on public.lead_preferences
  for each row execute function public.tg_lead_preferences_audit();

-- ─── Realtime ────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.lead_preferences;
