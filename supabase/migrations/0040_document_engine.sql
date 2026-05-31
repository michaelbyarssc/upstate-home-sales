-- ============================================================================
-- 0040_document_engine.sql
--
-- Hybrid document-template + e-signature engine.
--
-- The dealer uploads their own PDF (P.O., contract, disclosure) to a third-party
-- e-sign provider (SignWell), defines the field/signature layout there once, and
-- registers the provider template here. We own: template registry, mapping our
-- lead/home/quote/trade-in data onto the template's fields, snapshotting those
-- values (esp. price) at generate time, orchestrating in-person tablet signing,
-- and — critically — pulling the completed signed PDF + audit trail back into our
-- own storage so we are always the system of record (see api/webhooks/esign).
--
-- Tables:
--   • document_templates           — registry of provider templates
--   • document_template_field_map  — provider field -> our data binding
--   • document_instances           — one filled+sent doc for a lead (snapshot)
--   • document_signatures          — per-signer record (from completion webhook)
--   • signing_sessions             — in-person tablet / remote signing orchestration
--
-- Mirrors the org-isolation (org_ids / has_role_in), buyer-link RLS, price-snapshot,
-- storage path-prefix, and audit-trigger patterns from 0031 / 0011 / 0005 / 0002.
-- ============================================================================

-- ─── Extend workflow_event enum so the e-sign webhook can dispatch ──────────
-- Safe in a transaction on PG12+; we do not use the new values in this migration.
alter type public.workflow_event add value if not exists 'document.completed';
alter type public.workflow_event add value if not exists 'document.signed';

-- ─── Enums ──────────────────────────────────────────────────────────────────
create type public.document_template_kind as enum (
  'purchase_order', 'purchase_agreement', 'disclosure', 'addendum', 'generic'
);
create type public.document_template_status as enum ('draft', 'active', 'archived');
create type public.doc_field_source as enum ('binding', 'manual', 'signer');
create type public.doc_signer_role as enum ('buyer', 'co_buyer', 'seller', 'witness');
create type public.document_instance_status as enum (
  'draft', 'sent', 'partially_signed', 'completed', 'voided', 'declined'
);
create type public.signing_session_mode as enum ('in_person', 'remote');
create type public.signing_session_status as enum (
  'pending', 'in_progress', 'completed', 'expired', 'canceled'
);

-- ─── document_templates ─────────────────────────────────────────────────────
create table public.document_templates (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.orgs(id) on delete cascade,
  kind                 public.document_template_kind not null default 'generic',
  name                 text not null,
  description          text,
  provider             text not null default 'signwell',
  -- The provider's template id (SignWell). Null until the dealer links one.
  provider_template_id text,
  -- Optional copy of the blank source PDF in doc-templates bucket (DR / reference).
  source_pdf_path      text,
  status               public.document_template_status not null default 'draft',
  created_by           uuid references auth.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index document_templates_org_idx on public.document_templates (org_id, status);

create trigger document_templates_set_updated_at
  before update on public.document_templates
  for each row execute function public.tg_set_updated_at();

-- ─── document_template_field_map ────────────────────────────────────────────
-- Maps one provider field/placeholder -> a source for its value.
create table public.document_template_field_map (
  id                uuid primary key default gen_random_uuid(),
  template_id       uuid not null references public.document_templates(id) on delete cascade,
  org_id            uuid not null references public.orgs(id) on delete cascade,
  -- The provider's field/placeholder name or api_id (e.g. SignWell template field).
  provider_field_id text not null,
  label             text not null,
  source            public.doc_field_source not null,
  -- For source='binding': dotted path resolved by lib/documents/bindings.ts,
  --   e.g. 'home.listed_price_cents', 'lead.contact_name'.
  binding_key       text,
  -- For source='signer': which signer fills this signature/initials/role field.
  signer_role       public.doc_signer_role,
  required          boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (template_id, provider_field_id)
);
create index dtfm_template_idx on public.document_template_field_map (template_id);

-- ─── document_instances ─────────────────────────────────────────────────────
-- One generated document for a lead. snapshot_jsonb freezes the resolved field
-- values at generate time (this is where the price snapshot lives) — we prefill
-- the provider from it and never re-read homes/quotes afterward.
create table public.document_instances (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.orgs(id) on delete cascade,
  lead_id              uuid not null references public.leads(id) on delete cascade,
  template_id          uuid not null references public.document_templates(id) on delete restrict,
  home_id              uuid references public.homes(id) on delete set null,
  quote_id             uuid references public.quotes(id) on delete set null,
  trade_in_id          uuid references public.trade_ins(id) on delete set null,
  provider             text not null default 'signwell',
  -- The provider's envelope/document id once sent for signing.
  provider_envelope_id text,
  status               public.document_instance_status not null default 'draft',
  -- Per-org sequential number (like po_number) assigned on first generate.
  doc_number           int,
  -- Frozen copy of resolved field values { fields: [{ provider_field_id, source,
  --   binding_key, signer_role, value, value_cents, display }], generated_at }.
  snapshot_jsonb       jsonb not null default '{}'::jsonb,
  -- Denormalized money snapshot for fast list views (mirrors purchase_orders).
  listed_price_cents   bigint,
  -- Final immutable signed PDF (with SignWell's audit page) pulled into our storage.
  signed_pdf_path      text,
  audit_pdf_path       text,
  signed_pdf_sha256    text,
  public_token         text not null unique
                       default replace(gen_random_uuid()::text, '-', ''),
  created_by           uuid references auth.users(id),
  created_at           timestamptz not null default now(),
  completed_at         timestamptz,
  voided_at            timestamptz,
  voided_by            uuid references auth.users(id),
  void_reason          text,
  updated_at           timestamptz not null default now()
);
create unique index document_instances_org_number_uidx
  on public.document_instances (org_id, doc_number) where doc_number is not null;
create index document_instances_lead_idx on public.document_instances (lead_id, created_at desc);
create index document_instances_org_idx on public.document_instances (org_id, status, created_at desc);
create index document_instances_envelope_idx on public.document_instances (provider_envelope_id)
  where provider_envelope_id is not null;

create trigger document_instances_set_updated_at
  before update on public.document_instances
  for each row execute function public.tg_set_updated_at();

create or replace function public.next_document_number(p_org_id uuid)
returns int language sql stable as $$
  select coalesce(max(doc_number), 0) + 1
  from public.document_instances where org_id = p_org_id;
$$;

-- ─── document_signatures ────────────────────────────────────────────────────
-- Recorded from the completion webhook. The actual signature image + PKI seal
-- live inside the provider's signed PDF we store; this is the metadata trail.
create table public.document_signatures (
  id                    uuid primary key default gen_random_uuid(),
  instance_id           uuid not null references public.document_instances(id) on delete cascade,
  org_id                uuid not null references public.orgs(id) on delete cascade,
  signer_role           public.doc_signer_role not null,
  signer_name           text not null,
  signer_email          text,
  provider_recipient_id text,
  signer_ip             inet,
  signed_at             timestamptz not null default now()
);
create unique index document_signatures_role_uidx
  on public.document_signatures (instance_id, signer_role);
create index document_signatures_org_idx on public.document_signatures (org_id, signed_at desc);

create or replace function public.tg_document_signed_audit() returns trigger
language plpgsql as $$
begin
  perform public.emit_audit(
    new.org_id, 'document.signed', 'document_instances', new.instance_id,
    null,
    jsonb_build_object('signer_role', new.signer_role, 'signer_name', new.signer_name),
    null
  );
  return new;
end;
$$;

create trigger document_signatures_audit
  after insert on public.document_signatures
  for each row execute function public.tg_document_signed_audit();

-- ─── signing_sessions ───────────────────────────────────────────────────────
-- One in-person tablet hand-off or one remote link. Orchestrates which roles
-- sign in what order; carries our kiosk token (we wrap the provider URLs).
create table public.signing_sessions (
  id                  uuid primary key default gen_random_uuid(),
  instance_id         uuid not null references public.document_instances(id) on delete cascade,
  org_id              uuid not null references public.orgs(id) on delete cascade,
  mode                public.signing_session_mode not null,
  status              public.signing_session_status not null default 'pending',
  -- Ordered roles to collect in THIS session, e.g. {buyer,co_buyer}.
  signer_roles        public.doc_signer_role[] not null,
  current_role_idx    int not null default 0,
  -- role -> { recipientId, embeddedUrl } (provider recipient handles).
  recipient_map_jsonb jsonb not null default '{}'::jsonb,
  -- High-entropy token for the full-screen public /sign/[token] route.
  session_token       text not null unique
                      default replace(gen_random_uuid()::text, '-', '') ||
                              replace(gen_random_uuid()::text, '-', ''),
  remote_email        text,
  expires_at          timestamptz,
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  started_at          timestamptz,
  completed_at        timestamptz,
  updated_at          timestamptz not null default now()
);
create index signing_sessions_instance_idx on public.signing_sessions (instance_id);
create index signing_sessions_token_idx on public.signing_sessions (session_token);

create trigger signing_sessions_set_updated_at
  before update on public.signing_sessions
  for each row execute function public.tg_set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.document_templates          enable row level security;
alter table public.document_template_field_map enable row level security;
alter table public.document_instances          enable row level security;
alter table public.document_signatures         enable row level security;
alter table public.signing_sessions            enable row level security;

-- templates: members read; owner/manager author
create policy document_templates_select_member on public.document_templates
  for select to authenticated
  using (org_id = any(public.org_ids()));
create policy document_templates_modify_admin on public.document_templates
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  )
  with check (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  );

-- field map: same authority as templates
create policy dtfm_select_member on public.document_template_field_map
  for select to authenticated
  using (org_id = any(public.org_ids()));
create policy dtfm_modify_admin on public.document_template_field_map
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  )
  with check (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager']::public.role_enum[])
  );

-- instances: members read; owner/manager/sales modify (mirrors purchase_orders)
create policy document_instances_select_member on public.document_instances
  for select to authenticated
  using (org_id = any(public.org_ids()));
create policy document_instances_modify_member on public.document_instances
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- buyer read access to their COMPLETED documents (mirrors purchase_orders_buyer_select)
create policy document_instances_buyer_select on public.document_instances
  for select to authenticated
  using (
    status = 'completed'
    and exists (
      select 1 from public.buyer_lead_links bll
      where bll.buyer_id = auth.uid()
        and bll.lead_id = document_instances.lead_id
        and bll.status = 'active'
    )
  );

-- signatures: members read; inserts via service role (no insert policy)
create policy document_signatures_select_member on public.document_signatures
  for select to authenticated
  using (org_id = any(public.org_ids()));

-- signing_sessions: owner/manager/sales manage; anon signing reads the public view
create policy signing_sessions_modify_member on public.signing_sessions
  for all to authenticated
  using (
    org_id = any(public.org_ids())
    and public.has_role_in(org_id, array['owner','manager','sales']::public.role_enum[])
  )
  with check (org_id = any(public.org_ids()));

-- ─── Public view for the kiosk /sign page (anon by session_token) ───────────
-- Exposes only what the signer screen needs. The embedded signing URL is fetched
-- server-side via the provider adapter and is NOT in this view.
create view public.public_signing_sessions as
select
  ss.session_token,
  ss.mode,
  ss.status,
  ss.signer_roles,
  ss.current_role_idx,
  ss.expires_at,
  di.public_token as instance_token,
  di.status       as instance_status,
  dt.name         as template_name,
  o.name          as org_name,
  o.brand_color
from public.signing_sessions ss
join public.document_instances di on di.id = ss.instance_id
join public.document_templates dt on dt.id = di.template_id
join public.orgs o on o.id = ss.org_id;

grant select on public.public_signing_sessions to anon, authenticated;

-- Live status on the lead page while signing is in progress.
alter publication supabase_realtime add table public.document_instances;

-- ─── Storage buckets ────────────────────────────────────────────────────────
-- doc-templates: blank source PDFs (DR / reference). doc-instances: signed PDFs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('doc-templates', 'doc-templates', false, 26214400, array['application/pdf']),
  ('doc-instances', 'doc-instances', false, 26214400, array['application/pdf'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- doc-templates: org members (owner/manager) read/write, keyed on {org_id}/...
create policy "doc-templates member read" on storage.objects
  for select to authenticated
  using (bucket_id = 'doc-templates' and public.storage_org_id(name) = any(public.org_ids()));
create policy "doc-templates member write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'doc-templates'
    and public.storage_org_id(name) = any(public.org_ids())
    and public.has_role_in(public.storage_org_id(name),
        array['owner','manager']::public.role_enum[])
  );
create policy "doc-templates member delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'doc-templates'
    and public.storage_org_id(name) = any(public.org_ids())
    and public.has_role_in(public.storage_org_id(name),
        array['owner','manager']::public.role_enum[])
  );

-- doc-instances: signed PDFs are written by the webhook (service role). Members
-- read; linked buyers read their org's objects (mirrors quote_pdfs_buyer_select).
create policy "doc-instances member read" on storage.objects
  for select to authenticated
  using (bucket_id = 'doc-instances' and public.storage_org_id(name) = any(public.org_ids()));
create policy "doc-instances member write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'doc-instances' and public.storage_org_id(name) = any(public.org_ids()));
create policy "doc-instances buyer read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'doc-instances'
    and exists (
      select 1 from public.buyer_lead_links bll
      where bll.buyer_id = auth.uid()
        and bll.org_id::text = split_part(storage.objects.name, '/', 1)
        and bll.status = 'active'
    )
  );
