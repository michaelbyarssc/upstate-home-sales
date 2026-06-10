#!/usr/bin/env bash
# Push Resend env vars to both Vercel projects (uhs-admin + uhs-public) for the
# production and preview environments. Run from the repo root.
#
#   bash scripts/vercel-env-resend.sh
#
# RESEND_API_KEY (and optionally RESEND_WEBHOOK_SECRET, the Svix signing
# secret for the inbound webhook — uhs-public only) are prompted so they never
# appear in shell history. The other values are pre-filled below. Existing
# vars are overwritten (--force).
#
# ⚠ After running: redeploy both projects AND verify a real send — see
# docs/email-setup.md § "After changing email env". A wrong RESEND_FROM_EMAIL
# fails silently (2026-06-09 incident: 34 days of dead prod email).

set -euo pipefail

ENVS=(production preview)
APPS=(apps/admin apps/public)

# Non-secret values — must match the verified Resend domain
# (mail.upstatehomecenter.com; the old upstatehomesales.com domains are dead).
FROM_EMAIL="hello@mail.upstatehomecenter.com"
INBOUND_DOMAIN="replies.upstatehomecenter.com"
NOTIFY_EMAIL=""   # dealer inbox for new-lead alerts — fill in, or leave empty to skip

if ! command -v vercel >/dev/null 2>&1; then
  echo "vercel CLI not found on PATH"; exit 1
fi

add_var () {
  local app="$1" env="$2" name="$3" value="$4"
  echo "→ ${app} :: ${name} (${env})"
  ( cd "$app" && printf '%s' "$value" | vercel env add "$name" "$env" --force --yes >/dev/null )
}

# Read RESEND_API_KEY from stdin once and reuse for both apps + envs.
read -rsp "RESEND_API_KEY (input hidden, press Enter when done): " RESEND_API_KEY
echo
if [ -z "${RESEND_API_KEY:-}" ]; then
  echo "RESEND_API_KEY is required"; exit 1
fi

# Svix signing secret from Resend → Webhooks → (your endpoint) — only needed
# by uhs-public, which hosts /api/webhooks/inbound-email.
read -rsp "RESEND_WEBHOOK_SECRET (whsec_…, Enter to skip): " RESEND_WEBHOOK_SECRET
echo

for app in "${APPS[@]}"; do
  for env in "${ENVS[@]}"; do
    add_var "$app" "$env" RESEND_API_KEY      "$RESEND_API_KEY"
    add_var "$app" "$env" RESEND_FROM_EMAIL   "$FROM_EMAIL"
    add_var "$app" "$env" EMAIL_INBOUND_DOMAIN "$INBOUND_DOMAIN"
    if [ -n "$NOTIFY_EMAIL" ]; then
      add_var "$app" "$env" LEAD_NOTIFY_EMAIL "$NOTIFY_EMAIL"
    else
      echo "→ ${app} :: LEAD_NOTIFY_EMAIL skipped (NOTIFY_EMAIL empty)"
    fi
    if [ "$app" = "apps/public" ] && [ -n "${RESEND_WEBHOOK_SECRET:-}" ]; then
      add_var "$app" "$env" RESEND_WEBHOOK_SECRET "$RESEND_WEBHOOK_SECRET"
    fi
  done
done

echo
echo "Done. Trigger a redeploy on each project so the new vars take effect:"
echo "  ( cd apps/admin  && vercel --prod )"
echo "  ( cd apps/public && vercel --prod )"
echo "Then VERIFY a real send — docs/email-setup.md § 'After changing email env'."
