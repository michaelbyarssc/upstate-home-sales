-- ============================================================================
-- 0005_storage_buckets.sql
-- Buckets per handoff §07. Photo uploads to home-photos use signed URLs from
-- the upload-url edge function so the client never holds the service-role key.
-- Quote PDFs are signed-URL only. tradein-photos is authenticated read.
-- ============================================================================

-- ─── Buckets ────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('home-photos',     'home-photos',     true,  10485760, array['image/jpeg','image/png','image/webp']),
  ('quote-pdfs',      'quote-pdfs',      false, 20971520, array['application/pdf']),
  ('tradein-photos',  'tradein-photos',  false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('org-branding',    'org-branding',    true,  2097152,  array['image/jpeg','image/png','image/svg+xml','image/webp'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ─── Helper: pull org_id (first path segment) from an object name ───────────
create or replace function public.storage_org_id(name text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(name, '/', 1)::uuid
    else null
  end;
$$;

-- ─── home-photos: public read, member write/delete ──────────────────────────
drop policy if exists "home-photos public read"  on storage.objects;
drop policy if exists "home-photos member write" on storage.objects;
drop policy if exists "home-photos member delete" on storage.objects;

create policy "home-photos public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'home-photos');

create policy "home-photos member write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'home-photos'
    and public.storage_org_id(name) = any(public.org_ids())
    and public.has_role_in(public.storage_org_id(name),
        array['owner','manager','sales']::public.role_enum[])
  );

create policy "home-photos member delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'home-photos'
    and public.storage_org_id(name) = any(public.org_ids())
    and public.has_role_in(public.storage_org_id(name),
        array['owner','manager','sales']::public.role_enum[])
  );

-- ─── quote-pdfs: signed-URL access only (no public read policy) ─────────────
drop policy if exists "quote-pdfs member read"  on storage.objects;
drop policy if exists "quote-pdfs member write" on storage.objects;

create policy "quote-pdfs member read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'quote-pdfs'
    and public.storage_org_id(name) = any(public.org_ids())
  );

create policy "quote-pdfs member write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'quote-pdfs'
    and public.storage_org_id(name) = any(public.org_ids())
  );

-- ─── tradein-photos: authenticated members only ─────────────────────────────
drop policy if exists "tradein-photos member read"  on storage.objects;
drop policy if exists "tradein-photos member write" on storage.objects;

create policy "tradein-photos member read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tradein-photos'
    and public.storage_org_id(name) = any(public.org_ids())
  );

create policy "tradein-photos member write" on storage.objects
  for insert to authenticated, anon  -- anon submits trade-ins from the public form
  with check (bucket_id = 'tradein-photos');

-- ─── org-branding: public read, owner write ─────────────────────────────────
drop policy if exists "org-branding public read"  on storage.objects;
drop policy if exists "org-branding owner write"  on storage.objects;

create policy "org-branding public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'org-branding');

create policy "org-branding owner write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'org-branding'
    and public.storage_org_id(name) = any(public.org_ids())
    and public.has_role_in(public.storage_org_id(name),
        array['owner']::public.role_enum[])
  );
