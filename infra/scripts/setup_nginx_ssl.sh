#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   sudo bash setup_nginx_ssl.sh \
#     --repo-dir /opt/digitalchain \
#     --api-domain api.digitalchain.in \
#     --admin-domain admin.digitalchain.in \
#     --email you@digitalchain.in
#
# Requires: Ubuntu/Debian, root (sudo), network access

REPO_DIR=""
API_DOMAIN=""
ADMIN_DOMAIN=""
EMAIL=""

# Derive repo dir default from script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-dir) REPO_DIR="$2"; shift 2;;
    --api-domain) API_DOMAIN="$2"; shift 2;;
    --admin-domain) ADMIN_DOMAIN="$2"; shift 2;;
    --email) EMAIL="$2"; shift 2;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

if [[ -z "$REPO_DIR" ]]; then
  REPO_DIR="$DEFAULT_REPO_DIR"
fi

if [[ -z "$API_DOMAIN" || -z "$ADMIN_DOMAIN" || -z "$EMAIL" ]]; then
  cat >&2 <<EOF
Missing arguments.
Usage:
  sudo bash $0 \\
    --repo-dir $DEFAULT_REPO_DIR \\
    --api-domain api.digitalchain.in \\
    --admin-domain admin.digitalchain.in \\
    --email you@digitalchain.in
EOF
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx
systemctl enable nginx --now

# Install vhosts
if [[ ! -f "$REPO_DIR/infra/nginx/api.conf" || ! -f "$REPO_DIR/infra/nginx/admin.conf" ]]; then
  echo "Cannot find nginx config files in $REPO_DIR/infra/nginx/" >&2
  exit 1
fi

cp -f "$REPO_DIR/infra/nginx/api.conf" /etc/nginx/sites-available/digitalchain-api.conf
cp -f "$REPO_DIR/infra/nginx/admin.conf" /etc/nginx/sites-available/digitalchain-admin.conf

# Replace placeholders if any lingering
sed -i "s/api\.example\.com/$API_DOMAIN/g" /etc/nginx/sites-available/digitalchain-api.conf || true
sed -i "s/admin\.example\.com/$ADMIN_DOMAIN/g" /etc/nginx/sites-available/digitalchain-admin.conf || true

ln -sf /etc/nginx/sites-available/digitalchain-api.conf /etc/nginx/sites-enabled/digitalchain-api.conf
ln -sf /etc/nginx/sites-available/digitalchain-admin.conf /etc/nginx/sites-enabled/digitalchain-admin.conf

# Disable default site if present to avoid conflicts
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

# Create webroot for acme challenge (in case needed)
mkdir -p /var/www/certbot
chown -R www-data:www-data /var/www/certbot

# Issue certificates for both domains
certbot --nginx -d "$API_DOMAIN" -d "$ADMIN_DOMAIN" --redirect --non-interactive --agree-tos -m "$EMAIL"

# Validate renewal
certbot renew --dry-run

echo "Nginx + SSL setup complete for $API_DOMAIN and $ADMIN_DOMAIN"