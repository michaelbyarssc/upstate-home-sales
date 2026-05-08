-- ============================================================================
-- 0009_system_events_and_tradein_consent.sql
--
-- Two additions on top of 0007_leads:
--
-- 1. System events in the lead timeline. The audit log already records
--    stage + assignee changes (see tg_leads_audit in 0007), but those rows
--    aren't visible to the dealer in the lead detail view. This migration
--    adds a trigger that also writes a row into `lead_messages` with
--    kind='system' so the timeline shows the change inline alongside emails,
--    SMS, and notes. Realtime is already enabled on lead_messages, so the
--    detail page picks these up automatically.
--
-- 2. SMS opt-in tracking on `trade_ins`. The trade-in form now collects
--    TCPA consent (matching the quote and contact forms); these columns
--    persist that for compliance/audit.
-- ============================================================================

-- ─── 1. trade_ins consent columns ───────────────────────────────────────────
alter table public.trade_ins
  add column if not exists sms_consent      boolean not null default false,
  add column if not exists sms_consent_at   timestamptz,
  add column if not exists sms_consent_text text;

-- ─── 2. lead system-event trigger ───────────────────────────────────────────
-- Helper: human-friendly user label for system messages.
create or replace function public.user_short_label(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (select email from auth.users where id = p_user_id),
    substr(p_user_id::text, 1, 8)
  );
$$;

revoke all on function public.user_short_label(uuid) from public;
grant execute on function public.user_short_label(uuid) to authenticated;

create or replace function public.tg_leads_system_events()
returns trigger
language plpgsql
security definer  -- bypass lead_messages RLS; insert is system-generated
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_label text := coalesce(public.user_short_label(v_actor), 'system');
  v_assignee_label text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.stage is distinct from old.stage then
    insert into public.lead_messages (lead_id, org_id, kind, channel, author_id, body)
    values (
      new.id,
      new.org_id,
      'system',
      null,
      v_actor,
      format('Stage changed: %s → %s (by %s)',
        replace(old.stage::text, '_', ' '),
        replace(new.stage::text, '_', ' '),
        v_actor_label
      )
    );
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    if new.assignee_id is null then
      v_assignee_label := 'unassigned';
    else
      v_assignee_label := public.user_short_label(new.assignee_id);
    end if;

    insert into public.lead_messages (lead_id, org_id, kind, channel, author_id, body)
    values (
      new.id,
      new.org_id,
      'system',
      null,
      v_actor,
      format('Assigned to %s (by %s)', v_assignee_label, v_actor_label)
    );
  end if;

  if new.is_hot is distinct from old.is_hot then
    insert into public.lead_messages (lead_id, org_id, kind, channel, author_id, body)
    values (
      new.id,
      new.org_id,
      'system',
      null,
      v_actor,
      case when new.is_hot then format('Marked hot (by %s)', v_actor_label)
           else format('Hot flag cleared (by %s)', v_actor_label) end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists leads_system_events on public.leads;

create trigger leads_system_events
  after update on public.leads
  for each row execute function public.tg_leads_system_events();
