#!/usr/bin/env bash
# Issue a wildcard TLS cert for digitalchain.in and *.digitalchain.in using Cloudflare DNS-01
# Requirements:
#   - Ubuntu/Debian with apt
#   - DNS hosted on Cloudflare
#   - Cloudflare API token with Zone:DNS Edit for the zone
# Usage:
#   sudo bash infra/scripts/issue_wildcard_cloudflare.sh --email you@digitalchain.in --token-file /root/cloudflare.ini
# The token file should contain:
#   dns_cloudflare_api_token = <your_token>
set -euo pipefail
EMAIL=""
TOKEN_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --email) EMAIL="$2"; shift 2 ;;
    --token-file) TOKEN_FILE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done
if [[ -z "$EMAIL" || -z "$TOKEN_FILE" ]]; then
  echo "Usage: $0 --email you@digitalchain.in --token-file /path/to/cloudflare.ini"
  exit 1
fi
if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "Token file not found: $TOKEN_FILE"; exit 1
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y certbot python3-certbot-dns-cloudflare
install -m 600 -o root -g root "$TOKEN_FILE" /etc/letsencrypt/cloudflare.ini
# Request/renew a cert that covers apex and wildcard under the single name digitalchain.in
certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  -d digitalchain.in -d "*.digitalchain.in" \
  -m "$EMAIL" --agree-tos --non-interactive --keep-until-expiring
# Test auto-renew hook
certbot renew --dry-run || true
# Reload nginx to pick up the wildcard cert (paths already point to /etc/letsencrypt/live/digitalchain.in)
nginx -t && systemctl reload nginx
echo "Wildcard certificate installed for digitalchain.in and *.digitalchain.in."