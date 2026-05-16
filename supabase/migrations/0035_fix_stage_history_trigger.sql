-- ─────────────────────────────────────────────────────────────────────────────
-- 0035_fix_stage_history_trigger.sql
--
-- `tg_lead_stage_history` is the trigger that writes an audit row into
-- `lead_stage_history` whenever a lead's stage changes. As written in 0011 it
-- isn't SECURITY DEFINER, so it runs as the calling user — and
-- `lead_stage_history` has only a SELECT policy (no INSERT). Any authenticated
-- action that touches `leads.stage` fails with "new row violates row-level
-- security policy for table 'lead_stage_history'".
--
-- This bites the moment a workflow advances a lead's stage as a side effect
-- of sending a message (the user hit it when sending a second SMS).
--
-- Fix: mark the trigger function SECURITY DEFINER. The audit row is then
-- written as the function owner (Postgres superuser), bypassing RLS on the
-- audit table. `auth.uid()` keeps working — it reads request settings, not
-- session-scoped state.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tg_lead_stage_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
