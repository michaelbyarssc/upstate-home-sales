-- ─────────────────────────────────────────────────────────────────────────────
-- 0034_sms_consent_audit.sql
--
-- Augments the existing `leads.sms_consent` flag with audit columns so we
-- can defensibly answer "when, where, and how did this buyer opt in?" if
-- TCPA-challenged. Also adds an opt-in token used by the email-link flow.
-- ─────────────────────────────────────────────────────────────────────────────

-- `sms_consent_at` already exists in production (from an earlier migration).
-- Use IF NOT EXISTS per column so this migration is idempotent.
alter table public.leads add column if not exists sms_consent_at     timestamptz;
alter table public.leads add column if not exists sms_consent_ip     text;
alter table public.leads add column if not exists sms_consent_method text;
alter table public.leads add column if not exists sms_opt_in_token   text;

-- Add the CHECK constraint on sms_consent_method (separately, since
-- ADD COLUMN IF NOT EXISTS doesn't take a CHECK). Drop first in case a
-- prior partial run added it.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_sms_consent_method_check'
  ) then
    alter table public.leads
      add constraint leads_sms_consent_method_check
      check (sms_consent_method is null
             or sms_consent_method in ('form','admin','portal','email_link'));
  end if;
end$$;

create unique index if not exists leads_sms_opt_in_token_uidx
  on public.leads (sms_opt_in_token)
  where sms_opt_in_token is not null;
