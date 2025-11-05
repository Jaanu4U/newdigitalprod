#!/usr/bin/env bash
set -euo pipefail

API_DOMAIN=${1:-api.digitalchain.in}
ADMIN_DOMAIN=${2:-admin.digitalchain.in}

for url in \
  "http://$API_DOMAIN" \
  "https://$API_DOMAIN" \
  "https://$API_DOMAIN/v1/health" \
  "http://$ADMIN_DOMAIN" \
  "https://$ADMIN_DOMAIN"; do
  echo "---- $url"
  if ! curl -I --max-time 10 "$url"; then
    echo "Request failed: $url" >&2
  fi
  echo
done
