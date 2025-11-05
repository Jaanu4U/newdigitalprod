#!/usr/bin/env bash
set -euo pipefail

# Setup Nginx sites for digitalchain.in (root) and wildcard org subdomains.
# Optionally obtains certs for apex (HTTP-01). For wildcard (*.digitalchain.in), use a DNS plugin separately.
#
# Usage:
#   sudo bash setup_root_and_org_nginx.sh \
#     --repo-dir /opt/digitalchain \
#     --portal-port 3100 \
#     --email you@digitalchain.in
#
# After this, run certbot for apex:
#   certbot --nginx -d digitalchain.in -d www.digitalchain.in --redirect -m you@digitalchain.in --non-interactive --agree-tos
# For wildcard, use certbot with a DNS plugin (e.g. cloudflare) or acme.sh, then update ssl paths in org-https.conf to the wildcard cert paths.
#

REPO_DIR=""
PORTAL_PORT="3100"
EMAIL=""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-dir) REPO_DIR="$2"; shift 2;;
    --portal-port) PORTAL_PORT="$2"; shift 2;;
    --email) EMAIL="$2"; shift 2;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

if [[ -z "$REPO_DIR" ]]; then
  REPO_DIR="$DEFAULT_REPO_DIR"
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx
systemctl enable nginx --now

# Install root (apex) HTTP config
cp -f "$REPO_DIR/infra/nginx/root.conf" /etc/nginx/sites-available/digitalchain-root.conf
ln -sf /etc/nginx/sites-available/digitalchain-root.conf /etc/nginx/sites-enabled/digitalchain-root.conf

# Prepare org wildcard HTTPS config from template
ORG_CONF_TMP="/etc/nginx/sites-available/digitalchain-org.conf"
cp -f "$REPO_DIR/infra/nginx/org-https.conf.example" "$ORG_CONF_TMP"
# Replace upstream port if customized
sed -i "s/server 127.0.0.1:[0-9]\+;/server 127.0.0.1:${PORTAL_PORT};/" "$ORG_CONF_TMP" || true
ln -sf "$ORG_CONF_TMP" /etc/nginx/sites-enabled/digitalchain-org.conf

# Disable default site
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

# Obtain apex certificate (digitalchain.in + www)
if [[ -n "$EMAIL" ]]; then
  certbot --nginx -d digitalchain.in -d www.digitalchain.in --redirect -m "$EMAIL" --non-interactive --agree-tos || true
fi

cat <<EOF

Done.
Next steps:
1) For wildcard *.digitalchain.in, obtain a wildcard cert via DNS-01 (e.g., certbot-dns-cloudflare) and update ssl_certificate paths in /etc/nginx/sites-available/digitalchain-org.conf.
2) Ensure your Next.js portal is running on port ${PORTAL_PORT}.
3) Test:
   - https://digitalchain.in (landing + signup)
   - https://acme.digitalchain.in (org subdomain handled by wildcard vhost)
EOF
