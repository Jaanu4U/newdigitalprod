#!/usr/bin/env bash
# Certbot manual cleanup hook for DNS-01 (manual GoDaddy UI)
# We don't auto-remove manual DNS records. You may delete the TXT entries later if desired.
set -euo pipefail
RECORD="_acme-challenge.${CERTBOT_DOMAIN}"
echo "Cleanup: You can remove TXT ${RECORD} after issuance if you like."
