-- ============================================================================
-- 0015_customer_portal.sql
-- Phase D: branded buyer-facing portal.
--
-- A `buyers` row is one human, identified by their auth.users.id. A buyer
-- can be linked to many `leads` rows across multiple orgs (e.g. a shopper
-- comparing two dealers). Linkage is set when a salesperson invites the
-- buyer to the portal from the lead detail page, OR when a buyer signs up
-- with the same email as an existing lead and the system auto-links.
--
-- Tables:
--   buyers                  - profile per auth.user (one row per signed-up customer)
--   buyer_lead_links        - many-to-many between buyers and leads (per-org)
--   buyer_documents         - financing docs (DL, W2, proof of income) — paths
--                             to storage objects with signed URLs
--   buyer_suggested_homes   - homes a salesperson recommended for this buyer
--   lead_milestones         - dealer-facing project milestones surfaced to the
--                             buyer ("Quote sent", "Financing approved",
--                             "Delivery scheduled", "Setup complete", etc.)
--
-- RLS guarantees a buyer can only ever read their own buyers row + records
-- linked through buyer_lead_links → leads. Org members can only read/write
-- buyer-side artifacts for buyers tied to leads in their orgs.
-- ============================================================================

-- ─── buyers ────────────────────────────────────────────────────────────────
create table public.buyers (
  id              uuid primary key references auth.users(id) on delete cascade,
  full_name       text not null,
  email           text not null,
  phone           text,
  -- Notification opt-ins. SMS requires explicit consent under TCPA so default
  -- false; email defaults true since they signed up to receive their info.
  notify_email    boolean not null default true,
  notify_sms      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index buyers_email_idx on public.buyers (lower(email));

create trigger buyers_set_updated_at
  before update on public.buyers
  for each row execute function public.tg_set_updated_at();

-- ─── buyer_lead_links ──────────────────────────────────────────────────────
-- Why a junction: a buyer (one auth user) might have inquired with multiple
-- dealers OR with the same dealer multiple times across separate inquiries.
-- Org_id is denormalized here so RLS can scope without an extra join.
create table public.buyer_lead_links (
  id              uuid primary key default gen_random_uuid(),
  buyer_id        uuid not null references public.buyers(id) on delete cascade,
  lead_id         uuid not null references public.leads(id) on delete cascade,
  org_id          uuid not null references public.orgs(id) on delete cascade,
  -- 'invited' = salesperson sent the portal invite, buyer hasn't claimed yet
  -- 'active'  = buyer signed up and the link is verified
  status          text not null default 'invited' check (status in ('invited', 'active')),
  invited_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (buyer_id, lead_id)
);

create index buyer_lead_links_buyer_idx on public.buyer_lead_links (buyer_id);
create index buyer_lead_links_lead_idx on public.buyer_lead_links (lead_id);
create index buyer_lead_links_org_idx on public.buyer_lead_links (org_id);

-- ─── buyer_documents ───────────────────────────────────────────────────────
create type public.buyer_doc_kind as enum (
  'driver_license',
  'w2',
  'proof_of_income',
  'bank_statement',
  'other'
);

create table public.buyer_documents (
  id              uuid primary key default gen_random_uuid(),
  buyer_id        uuid not null references public.buyers(id) on delete cascade,
  -- Optional: tie to a specific lead so the dealer sees it on that lead.
  -- Buyer-uploaded docs without a lead link are private to the buyer until
  -- the buyer initiates contact.
  lead_id         uuid references public.leads(id) on delete set null,
  org_id          uuid references public.orgs(id) on delete set null,
  kind            public.buyer_doc_kind not null,
  storage_path    text not null,
  original_name   text not null,
  size_bytes      int not null,
  content_type    text not null,
  uploaded_at     timestamptz not null default now()
);

create index buyer_documents_buyer_idx on public.buyer_documents (buyer_id, uploaded_at desc);
create index buyer_documents_lead_idx on public.buyer_documents (lead_id) where lead_id is not null;
create index buyer_documents_org_idx on public.buyer_documents (org_id) where org_id is not null;

-- ─── buyer_suggested_homes ─────────────────────────────────────────────────
create table public.buyer_suggested_homes (
  id              uuid primary key default gen_random_uuid(),
  buyer_id        uuid not null references public.buyers(id) on delete cascade,
  home_id         uuid not null references public.homes(id) on delete cascade,
  org_id          uuid not null references public.orgs(id) on delete cascade,
  -- Optional note from the salesperson explaining why ("matches your budget",
  -- "you mentioned wanting an island kitchen", etc.).
  note            text,
  suggested_by    uuid references auth.users(id) on delete set null,
  suggested_at    timestamptz not null default now(),
  -- Buyer-side state: did they save it / dismiss it?
  buyer_state     text not null default 'unread' check (buyer_state in ('unread', 'saved', 'dismissed')),
  unique (buyer_id, home_id)
);

create index buyer_suggested_homes_buyer_idx on public.buyer_suggested_homes (buyer_id, suggested_at desc);
create index buyer_suggested_homes_org_idx on public.buyer_suggested_homes (org_id);

-- ─── lead_milestones ───────────────────────────────────────────────────────
-- Dealer creates milestones on a lead's purchase journey ("Financing
-- approved", "Delivery scheduled for Friday", etc.). Buyer sees them in
-- /portal/milestones as a read-only timeline.
create type public.milestone_status as enum ('pending', 'in_progress', 'complete');

create table public.lead_milestones (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads(id) on delete cascade,
  org_id          uuid not null references public.orgs(id) on delete cascade,
  title           text not null,
  body            text,
  status          public.milestone_status not null default 'pending',
  sort_order      int not null default 0,
  due_at          timestamptz,
  completed_at    timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index lead_milestones_lead_idx on public.lead_milestones (lead_id, sort_order);
create index lead_milestones_org_idx on public.lead_milestones (org_id, created_at desc);

create trigger lead_milestones_set_updated_at
  before update on public.lead_milestones
  for each row execute function public.tg_set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.buyers enable row level security;
alter table public.buyer_lead_links enable row level security;
alter table public.buyer_documents enable row level security;
alter table public.buyer_suggested_homes enable row level security;
alter table public.lead_milestones enable row level security;

-- buyers: a buyer reads/updates their own row only.
create policy buyers_self_select on public.buyers
  for select to authenticated
  using (id = auth.uid());

create policy buyers_self_insert on public.buyers
  for insert to authenticated
  with check (id = auth.uid());

create policy buyers_self_update on public.buyers
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Org members can read buyer profiles tied to leads in their orgs.
create policy buyers_org_read on public.buyers
  for select to authenticated
  using (
    exists (
      select 1 from public.buyer_lead_links bll
      where bll.buyer_id = buyers.id
        and bll.org_id = any(public.org_ids())
    )
  );

-- buyer_lead_links: buyer reads their own; org members read their org's.
create policy buyer_lead_links_self_select on public.buyer_lead_links
  for select to authenticated
  using (buyer_id = auth.uid());

create policy buyer_lead_links_org_select on public.buyer_lead_links
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy buyer_lead_links_org_modify on public.buyer_lead_links
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- buyer_documents: buyer rwx their own; org members read those tied to their org's leads.
create policy buyer_documents_self_all on public.buyer_documents
  for all to authenticated
  using (buyer_id = auth.uid())
  with check (buyer_id = auth.uid());

create policy buyer_documents_org_select on public.buyer_documents
  for select to authenticated
  using (
    org_id is not null
    and org_id = any(public.org_ids())
  );

-- buyer_suggested_homes: buyer reads + updates their own state; org writes their suggestions.
create policy buyer_suggested_homes_self_select on public.buyer_suggested_homes
  for select to authenticated
  using (buyer_id = auth.uid());

create policy buyer_suggested_homes_self_state on public.buyer_suggested_homes
  for update to authenticated
  using (buyer_id = auth.uid())
  with check (buyer_id = auth.uid());

create policy buyer_suggested_homes_org_all on public.buyer_suggested_homes
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- lead_milestones: buyer reads via their links; org members rwx their org's.
create policy lead_milestones_buyer_select on public.lead_milestones
  for select to authenticated
  using (
    exists (
      select 1 from public.buyer_lead_links bll
      where bll.lead_id = lead_milestones.lead_id
        and bll.buyer_id = auth.uid()
        and bll.status = 'active'
    )
  );

create policy lead_milestones_org_select on public.lead_milestones
  for select to authenticated
  using (org_id = any(public.org_ids()));

create policy lead_milestones_org_modify on public.lead_milestones
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- ─── Storage bucket: buyer-documents ───────────────────────────────────────
-- Private bucket. Access via signed URLs only — the buyer or org member
-- requests a signed URL through a server action.
insert into storage.buckets (id, name, public)
values ('buyer-documents', 'buyer-documents', false)
on conflict (id) do nothing;

-- Storage RLS: buyers can upload to their own folder ({user_id}/...);
-- nobody else can write. Reads are gated through signed URLs (no policy
-- allows direct anon reads).
create policy buyer_documents_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'buyer-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy buyer_documents_storage_select_own
  on storage.objects for select to authenticated
  using (
    bucket_id = 'buyer-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy buyer_documents_storage_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'buyer-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admin/service role bypasses RLS for org-side reads via createSignedUrl.

-- ─── Realtime ──────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.lead_milestones;
alter publication supabase_realtime add table public.buyer_suggested_homes;
