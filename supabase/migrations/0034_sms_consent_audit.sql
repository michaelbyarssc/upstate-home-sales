-- ─────────────────────────────────────────────────────────────────────────────
-- 0034_sms_consent_audit.sql
--
-- Augments the existing `leads.sms_consent` flag with audit columns so we
-- can defensibly answer "when, where, and how did this buyer opt in?" if
-- TCPA-challenged. Also adds an opt-in token used by the email-link flow.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.leads
  add column sms_consent_at        timestamptz,
  add column sms_consent_ip        text,
  add column sms_consent_method    text check (sms_consent_method in ('form','admin','portal','email_link')),
  add column sms_opt_in_token      text;

create unique index leads_sms_opt_in_token_uidx
  on public.leads (sms_opt_in_token)
  where sms_opt_in_token is not null;
