#!/usr/bin/env bash
#
# DEPRECATED — DO NOT RUN.
#
# This applied DNS records for upstatehomesales.com when that zone was hosted
# on Cloudflare. As of 2026-05 the email stack moved to
# mail.upstatehomecenter.com and BOTH domains delegate to GoDaddy nameservers
# again — there is no active Cloudflare zone for these records to land in,
# and mail.upstatehomesales.com shows "failed" in Resend.
#
# Manage DNS in the GoDaddy dashboard. Current setup: docs/email-setup.md.
# Kept in repo for historical reference only.

echo "This script is deprecated — DNS is managed in the GoDaddy dashboard now."
echo "See docs/email-setup.md for the current email/DNS setup."
exit 1

# Apply all required DNS records for upstatehomesales.com via the Cloudflare API.
#
# Prereq:
#   1. Domain added to Cloudflare (free plan).
#   2. Nameservers at GoDaddy switched to the two Cloudflare NS records shown
#      in the Cloudflare dashboard (registration stays at GoDaddy).
#   3. Cloudflare Email Routing enabled on the zone — this is what creates
#      the actual inbound MX records, so we do NOT add MX here.
#   4. Cloudflare Worker `uhs-inbound-email-router` already deployed (see
#      workers/inbound-email-router/) and bound under
#      Email → Routing Rules → Catch-all → "Send to a Worker".
#
# Required env:
#   CF_API_TOKEN  Cloudflare API token with Zone:Edit on this zone
#   CF_ZONE_ID    Cloudflare zone id (Cloudflare dashboard → API → Zone ID)
#
# Resend-specific values must be filled in below from the Resend dashboard
# AFTER you click "Add domain" → "mail.upstatehomesales.com" in Resend. Resend
# generates unique selectors per account, so we cannot hardcode them.
#
# Usage:
#   CF_API_TOKEN=... CF_ZONE_ID=... ./scripts/cloudflare-dns-apply.sh

set -euo pipefail

: "${CF_API_TOKEN:?CF_API_TOKEN required}"
: "${CF_ZONE_ID:?CF_ZONE_ID required}"

API="https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records"
AUTH=(-H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json")

# ─── Resend values to fill in (from Resend dashboard → Domains → mail) ──────
# Resend shows a TXT record (SPF), one MX (return-path), one TXT (DMARC), and
# one CNAME (DKIM, with a per-account selector). Paste them here.
RESEND_DKIM_SELECTOR=""                  # e.g. resend
RESEND_DKIM_TARGET=""                    # e.g. resend._domainkey.something.resend.com

upsert() {
  local payload="$1"
  local name; name=$(echo "$payload" | jq -r '.name')
  local type; type=$(echo "$payload" | jq -r '.type')
  echo "→ ${type} ${name}"

  local existing
  existing=$(curl -fsS "${AUTH[@]}" "${API}?name=${name}&type=${type}" | jq -r '.result[0].id // empty')
  if [[ -n "${existing}" ]]; then
    curl -fsS -X PUT "${AUTH[@]}" -d "$payload" "${API}/${existing}" >/dev/null
  else
    curl -fsS -X POST "${AUTH[@]}" -d "$payload" "${API}" >/dev/null
  fi
  echo "  ✓"
}

# ─── Vercel apex + admin ────────────────────────────────────────────────────
upsert '{"type":"A",   "name":"upstatehomesales.com",      "content":"76.76.21.21","ttl":1,"proxied":false}'
upsert '{"type":"A",   "name":"admin.upstatehomesales.com","content":"76.76.21.21","ttl":1,"proxied":false}'

# ─── Resend outbound on mail.upstatehomesales.com ───────────────────────────
# SPF — authorize Resend to send for mail.<domain>
upsert '{"type":"TXT","name":"mail.upstatehomesales.com","content":"v=spf1 include:_spf.resend.com ~all","ttl":1}'

# Return-path MX so bounces flow back to Resend's verification system.
upsert '{"type":"MX","name":"mail.upstatehomesales.com","content":"feedback-smtp.us-east-1.amazonses.com","priority":10,"ttl":1}'

# DKIM CNAME — fill in the two values from the Resend dashboard
if [[ -n "${RESEND_DKIM_SELECTOR}" && -n "${RESEND_DKIM_TARGET}" ]]; then
  upsert "$(jq -nc \
    --arg name "${RESEND_DKIM_SELECTOR}._domainkey.mail.upstatehomesales.com" \
    --arg target "${RESEND_DKIM_TARGET}" \
    '{type:"CNAME",name:$name,content:$target,ttl:1,proxied:false}')"
else
  echo "  ⚠ Skipping Resend DKIM — fill in RESEND_DKIM_SELECTOR + RESEND_DKIM_TARGET first."
fi

# ─── DMARC (apex) ───────────────────────────────────────────────────────────
upsert '{"type":"TXT","name":"_dmarc.upstatehomesales.com","content":"v=DMARC1; p=none; rua=mailto:postmaster@upstatehomesales.com","ttl":1}'

# ─── NOTE on inbound (replies.upstatehomesales.com) ─────────────────────────
# We deliberately do NOT create MX records for `replies` here. Cloudflare
# Email Routing manages those automatically when you enable Email Routing on
# the zone — adding our own would conflict. See docs/email-setup.md §3.

echo
echo "Done. Verify with:"
echo "  dig +short upstatehomesales.com a"
echo "  dig +short admin.upstatehomesales.com a"
echo "  dig +short mail.upstatehomesales.com txt"
echo "  dig +short mail.upstatehomesales.com mx"
echo "  dig +short _dmarc.upstatehomesales.com txt"
echo "  dig +short replies.upstatehomesales.com mx    # set by Cloudflare Email Routing"
