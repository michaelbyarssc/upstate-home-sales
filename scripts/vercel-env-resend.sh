#!/usr/bin/env bash
# Push Resend env vars to both Vercel projects (admin + public) for the
# production and preview environments. Run from the repo root.
#
#   bash scripts/vercel-env-resend.sh
#
# RESEND_API_KEY is prompted twice (once per app) so it never appears in
# shell history. The other three values are pre-filled below.

set -euo pipefail

ENVS=(production preview)
APPS=(apps/admin apps/public)

# Non-secret values
FROM_EMAIL="hello@mail.upstatehomesales.com"
INBOUND_DOMAIN="mail.upstatehomesales.com"
NOTIFY_EMAIL="hello@upstatehomesales.com"

if ! command -v vercel >/dev/null 2>&1; then
  echo "vercel CLI not found on PATH"; exit 1
fi

add_var () {
  local app="$1" env="$2" name="$3" value="$4"
  echo "→ ${app} :: ${name} (${env})"
  ( cd "$app" && printf '%s' "$value" | vercel env add "$name" "$env" --yes >/dev/null )
}

# Read RESEND_API_KEY from stdin once and reuse for both apps + envs.
read -rsp "RESEND_API_KEY (input hidden, press Enter when done): " RESEND_API_KEY
echo
if [ -z "${RESEND_API_KEY:-}" ]; then
  echo "RESEND_API_KEY is required"; exit 1
fi

for app in "${APPS[@]}"; do
  for env in "${ENVS[@]}"; do
    add_var "$app" "$env" RESEND_API_KEY      "$RESEND_API_KEY"
    add_var "$app" "$env" RESEND_FROM_EMAIL   "$FROM_EMAIL"
    add_var "$app" "$env" EMAIL_INBOUND_DOMAIN "$INBOUND_DOMAIN"
    add_var "$app" "$env" LEAD_NOTIFY_EMAIL   "$NOTIFY_EMAIL"
  done
done

echo
echo "Done. Trigger a redeploy on each project so the new vars take effect:"
echo "  ( cd apps/admin  && vercel --prod )"
echo "  ( cd apps/public && vercel --prod )"
