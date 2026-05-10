#!/usr/bin/env bash
# Apply DNS records for the NEW web domain `upstatehomecenter.com` via the
# Cloudflare API. Web-only — email is intentionally left on the old domain
# (upstatehomesales.com) for now. See scripts/cloudflare-dns-apply.sh for
# the old-domain (email-bearing) records.
#
# Prereq:
#   1. Domain `upstatehomecenter.com` added to Cloudflare (free plan).
#   2. Nameservers at GoDaddy switched to the two Cloudflare NS records shown
#      in the Cloudflare dashboard for upstatehomecenter.com.
#
# Required env:
#   CF_API_TOKEN  Cloudflare API token with Zone:Edit on the new zone
#   CF_ZONE_ID    Cloudflare zone id for upstatehomecenter.com
#
# Usage:
#   CF_API_TOKEN=... CF_ZONE_ID=... ./scripts/cloudflare-dns-apply-newdomain.sh

set -euo pipefail

: "${CF_API_TOKEN:?CF_API_TOKEN required}"
: "${CF_ZONE_ID:?CF_ZONE_ID required (zone id for upstatehomecenter.com)}"

API="https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records"
AUTH=(-H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json")

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

# ─── Vercel apex + admin + www ──────────────────────────────────────────────
# Vercel's anycast A IP for managed domains.
upsert '{"type":"A","name":"upstatehomecenter.com",      "content":"76.76.21.21","ttl":1,"proxied":false}'
upsert '{"type":"A","name":"admin.upstatehomecenter.com","content":"76.76.21.21","ttl":1,"proxied":false}'
# www → apex (Vercel handles the redirect server-side once the domain is added)
upsert '{"type":"CNAME","name":"www.upstatehomecenter.com","content":"cname.vercel-dns.com","ttl":1,"proxied":false}'

# ─── DMARC (apex) ───────────────────────────────────────────────────────────
# Set even though email isn't on this domain yet — protects against spoofing.
upsert '{"type":"TXT","name":"_dmarc.upstatehomecenter.com","content":"v=DMARC1; p=reject; rua=mailto:postmaster@upstatehomesales.com","ttl":1}'

# ─── SPF reject ─────────────────────────────────────────────────────────────
# Hard-fail any mail claiming to come from upstatehomecenter.com — we don't
# send from this domain. Prevents spammers from forging the new brand.
upsert '{"type":"TXT","name":"upstatehomecenter.com","content":"v=spf1 -all","ttl":1}'

echo
echo "Done. Verify with:"
echo "  dig +short upstatehomecenter.com a"
echo "  dig +short admin.upstatehomecenter.com a"
echo "  dig +short www.upstatehomecenter.com cname"
echo "  dig +short _dmarc.upstatehomecenter.com txt"
echo
echo "Next: add the domain in Vercel (vercel domains add upstatehomecenter.com)"
echo "      and update NEXT_PUBLIC_PUBLIC_URL / NEXT_PUBLIC_ADMIN_URL env vars."
