-- ============================================================================
-- 0008_audit_extensions.sql
-- Extend the audit ledger to cover homes (pricing/status), quotes (sent),
-- and org_members (role/status). Leads were already covered in 0007.
-- ============================================================================

-- ─── homes ──────────────────────────────────────────────────────────────────
-- Capture price-affecting changes and status transitions. Skips updates that
-- only touch updated_at / generated cols so the ledger stays signal-rich.
create or replace function public.tg_homes_audit() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_audit(
      new.org_id, 'home.created', 'homes', new.id,
      null,
      jsonb_build_object(
        'stock_no', new.stock_no, 'name', new.name, 'status', new.status,
        'base_price_cents', new.base_price_cents, 'markup_pct', new.markup_pct,
        'listed_price_cents', new.listed_price_cents
      ),
      null
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if  new.base_price_cents       is distinct from old.base_price_cents
     or new.markup_pct              is distinct from old.markup_pct
     or new.addons_cents            is distinct from old.addons_cents
     or new.setup_cents             is distinct from old.setup_cents
     or new.include_setup_in_price  is distinct from old.include_setup_in_price
    then
      perform public.emit_audit(
        new.org_id, 'home.pricing.changed', 'homes', new.id,
        jsonb_build_object(
          'base_price_cents', old.base_price_cents,
          'markup_pct',       old.markup_pct,
          'addons_cents',     old.addons_cents,
          'setup_cents',      old.setup_cents,
          'include_setup_in_price', old.include_setup_in_price,
          'listed_price_cents', old.listed_price_cents
        ),
        jsonb_build_object(
          'base_price_cents', new.base_price_cents,
          'markup_pct',       new.markup_pct,
          'addons_cents',     new.addons_cents,
          'setup_cents',      new.setup_cents,
          'include_setup_in_price', new.include_setup_in_price,
          'listed_price_cents', new.listed_price_cents
        ),
        null
      );
    end if;

    if new.status is distinct from old.status then
      perform public.emit_audit(
        new.org_id, 'home.status.changed', 'homes', new.id,
        jsonb_build_object('status', old.status),
        jsonb_build_object('status', new.status),
        null
      );
    end if;

    if new.deleted_at is distinct from old.deleted_at and new.deleted_at is not null then
      perform public.emit_audit(
        new.org_id, 'home.deleted', 'homes', new.id,
        to_jsonb(old), null, null
      );
    end if;
    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists homes_audit on public.homes;
create trigger homes_audit
  after insert or update on public.homes
  for each row execute function public.tg_homes_audit();

-- ─── quotes ─────────────────────────────────────────────────────────────────
-- Single 'quote.created' event per row. Quote rows are immutable in v1, so we
-- don't track UPDATEs (would just be noise).
create or replace function public.tg_quotes_audit() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_audit(
      new.org_id, 'quote.created', 'quotes', new.id,
      null,
      jsonb_build_object(
        'lead_id',            new.lead_id,
        'home_id',            new.home_id,
        'listed_price_cents', new.listed_price_cents,
        'expires_at',         new.expires_at,
        'public_token',       new.public_token
      ),
      null
    );
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_audit on public.quotes;
create trigger quotes_audit
  after insert on public.quotes
  for each row execute function public.tg_quotes_audit();

-- ─── org_members ────────────────────────────────────────────────────────────
-- Track invites, role changes, and suspensions. These are SOC-relevant events.
create or replace function public.tg_org_members_audit() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_audit(
      new.org_id, 'member.invited', 'org_members', new.user_id,
      null,
      jsonb_build_object('user_id', new.user_id, 'role', new.role, 'status', new.status),
      null
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      perform public.emit_audit(
        new.org_id, 'member.role.changed', 'org_members', new.user_id,
        jsonb_build_object('role', old.role),
        jsonb_build_object('role', new.role),
        null
      );
    end if;
    if new.status is distinct from old.status then
      perform public.emit_audit(
        new.org_id, 'member.status.changed', 'org_members', new.user_id,
        jsonb_build_object('status', old.status),
        jsonb_build_object('status', new.status),
        null
      );
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.emit_audit(
      old.org_id, 'member.removed', 'org_members', old.user_id,
      jsonb_build_object('role', old.role, 'status', old.status),
      null,
      null
    );
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists org_members_audit on public.org_members;
create trigger org_members_audit
  after insert or update or delete on public.org_members
  for each row execute function public.tg_org_members_audit();
