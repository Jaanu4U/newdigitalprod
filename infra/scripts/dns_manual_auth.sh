#!/usr/bin/env bash
# Certbot manual auth hook for DNS-01 (manual GoDaddy UI)
# Prints required TXT record and waits until it appears in DNS.
set -euo pipefail
RECORD="_acme-challenge.${CERTBOT_DOMAIN}"
VALUE="${CERTBOT_VALIDATION}"
OUTFILE="/root/digitalchain/infra/dns-challenges.txt"

mkdir -p "$(dirname "$OUTFILE")"
{
  echo "=============================="
  date -u '+%Y-%m-%dT%H:%M:%SZ'
  echo "Add this DNS TXT record in GoDaddy for domain: ${CERTBOT_DOMAIN}"
  echo "Name:  ${RECORD}"
  echo "Type:  TXT"
  echo "Value: ${VALUE}"
  echo "TTL:   60 (or the minimum allowed)"
} | tee -a "$OUTFILE"

# Poll public DNS until the TXT is visible
MAX_TRIES=60   # ~20 minutes if INTERVAL=20
INTERVAL=20
FOUND=0
for i in $(seq 1 $MAX_TRIES); do
  RES=$(dig +short TXT ${RECORD} @1.1.1.1 || true)
  if echo "$RES" | grep -Fq "$VALUE"; then
    FOUND=1
    echo "Detected TXT in DNS for ${RECORD}. Continuing..." | tee -a "$OUTFILE"
    break
  fi
  echo "Waiting for DNS propagation (${i}/${MAX_TRIES})..." | tee -a "$OUTFILE"
  sleep $INTERVAL
done

if [[ $FOUND -ne 1 ]]; then
  echo "ERROR: TXT record not detected in time for ${RECORD}. Aborting." | tee -a "$OUTFILE"
  exit 1
fi
