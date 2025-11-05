#!/usr/bin/env bash
# Issue a wildcard TLS cert for digitalchain.in and *.digitalchain.in using GoDaddy DNS-01 via acme.sh
# Requirements:
#   - Root privileges
#   - GoDaddy developer API key/secret (https://developer.godaddy.com/keys)
#   - DNS zone for the domain hosted at GoDaddy
# This script installs acme.sh if missing, issues the cert, installs it to /etc/letsencrypt/live/digitalchain.in,
# and reloads nginx.
#
# Usage examples:
#   sudo bash infra/scripts/issue_wildcard_godaddy.sh --email you@digitalchain.in --env-file /root/godaddy.env
#   sudo bash infra/scripts/issue_wildcard_godaddy.sh --email you@digitalchain.in --key ABC123 --secret XYZ789
#
# The env file format:
#   GD_Key=your_godaddy_api_key
#   GD_Secret=your_godaddy_api_secret
set -euo pipefail

EMAIL=""
DOMAIN="digitalchain.in"
GD_KEY=""
GD_SECRET=""
ENV_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --email) EMAIL="$2"; shift 2;;
    --domain) DOMAIN="$2"; shift 2;;
    --key) GD_KEY="$2"; shift 2;;
    --secret) GD_SECRET="$2"; shift 2;;
    --env-file) ENV_FILE="$2"; shift 2;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

if [[ -z "$EMAIL" ]]; then
  echo "--email is required" >&2
  exit 1
fi

if [[ -n "$ENV_FILE" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Env file not found: $ENV_FILE" >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

if [[ -z "${GD_Key:-$GD_KEY}" || -z "${GD_Secret:-$GD_SECRET}" ]]; then
  echo "GoDaddy API credentials missing. Provide --key/--secret or --env-file with GD_Key and GD_Secret." >&2
  exit 1
fi

# Merge into env vars expected by acme.sh
export GD_Key="${GD_Key:-$GD_KEY}"
export GD_Secret="${GD_Secret:-$GD_SECRET}"

# Install acme.sh if missing
if ! command -v acme.sh >/dev/null 2>&1; then
  curl -fsSL https://get.acme.sh | sh -s email=$EMAIL
  export PATH="$HOME/.acme.sh:$PATH"
fi

# Ensure path is available for current shell too
if ! command -v acme.sh >/dev/null 2>&1; then
  export PATH="$HOME/.acme.sh:$PATH"
fi

mkdir -p /etc/letsencrypt/live/$DOMAIN
chmod 700 /etc/letsencrypt/live/$DOMAIN

# Issue cert for apex and wildcard
~/.acme.sh/acme.sh --issue \
  --dns dns_gd \
  -d "$DOMAIN" -d "*.$DOMAIN" \
  --keylength ec-256 || true

# Also try RSA if ECDSA not supported by client config
if [[ ! -f "$HOME/.acme.sh/$DOMAIN_ecc/fullchain.cer" ]]; then
  ~/.acme.sh/acme.sh --issue --dns dns_gd -d "$DOMAIN" -d "*.$DOMAIN"
fi

# Install cert to standard paths Nginx is using
# Prefer ECDSA if present
if [[ -f "$HOME/.acme.sh/$DOMAIN_ecc/fullchain.cer" ]]; then
  ~/.acme.sh/acme.sh --install-cert -d "$DOMAIN" \
    --ecc \
    --fullchain-file /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
    --key-file       /etc/letsencrypt/live/$DOMAIN/privkey.pem \
    --reloadcmd     "nginx -t && systemctl reload nginx"
else
  ~/.acme.sh/acme.sh --install-cert -d "$DOMAIN" \
    --fullchain-file /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
    --key-file       /etc/letsencrypt/live/$DOMAIN/privkey.pem \
    --reloadcmd     "nginx -t && systemctl reload nginx"
fi

chmod 600 /etc/letsencrypt/live/$DOMAIN/privkey.pem || true

echo "Wildcard certificate installed for $DOMAIN and *.$DOMAIN. Nginx reloaded."
