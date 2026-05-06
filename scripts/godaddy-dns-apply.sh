#!/usr/bin/env bash
# Apply all required DNS records for upstatehomesales.com via GoDaddy API.
#
# Prereq: domain status must be ACTIVE (not PENDING_HOLD_ESCROW).
# Verify with:
#   curl -sS -H "Authorization: sso-key $GD_KEY:$GD_SECRET" \
#        https://api.godaddy.com/v1/domains/upstatehomesales.com | jq .status
#
# Usage:
#   GD_KEY=... GD_SECRET=... ./scripts/godaddy-dns-apply.sh

set -euo pipefail

: "${GD_KEY:?GD_KEY env var required}"
: "${GD_SECRET:?GD_SECRET env var required}"

DOMAIN="upstatehomesales.com"
AUTH="Authorization: sso-key ${GD_KEY}:${GD_SECRET}"
BASE="https://api.godaddy.com/v1/domains/${DOMAIN}/records"

put_record() {
  local type="$1" host="$2" body="$3"
  echo "→ ${type} ${host}"
  curl -fsS -X PUT \
    -H "${AUTH}" \
    -H "Content-Type: application/json" \
    -d "${body}" \
    "${BASE}/${type}/${host}"
  echo " ✓"
}

# Vercel apex + admin subdomain (project-level domain forwarding handled by Vercel)
put_record A "@"     '[{"data":"76.76.21.21","ttl":3600}]'
put_record A "admin" '[{"data":"76.76.21.21","ttl":3600}]'

# SendGrid domain authentication (link-branding + DKIM + return-path)
put_record CNAME "url1136"          '[{"data":"sendgrid.net","ttl":3600}]'
put_record CNAME "106931890"        '[{"data":"sendgrid.net","ttl":3600}]'
put_record CNAME "em9029"           '[{"data":"u106931890.wl141.sendgrid.net","ttl":3600}]'
put_record CNAME "s1._domainkey"    '[{"data":"s1.domainkey.u106931890.wl141.sendgrid.net","ttl":3600}]'
put_record CNAME "s2._domainkey"    '[{"data":"s2.domainkey.u106931890.wl141.sendgrid.net","ttl":3600}]'

# DMARC report policy (none = monitoring only; tighten to quarantine/reject after 30 days clean)
put_record TXT "_dmarc"             '[{"data":"v=DMARC1; p=none;","ttl":3600}]'

echo
echo "All records applied. Verify with:"
echo "  dig +short upstatehomesales.com a"
echo "  dig +short admin.upstatehomesales.com a"
echo "  dig +short em9029.upstatehomesales.com cname"
echo "  dig +short _dmarc.upstatehomesales.com txt"
