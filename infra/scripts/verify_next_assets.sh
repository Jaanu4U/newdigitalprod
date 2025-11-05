#!/usr/bin/env bash
set -euo pipefail

DOMAIN=${1:-admin.digitalchain.in}

# Try to discover a likely asset by requesting the root and grepping for /_next/static
HTML=$(curl -sS --max-time 10 "https://$DOMAIN/") || true
ASSET=$(echo "$HTML" | grep -oE "/_next/static/[^\"]+\.js" | head -n1 || true)

if [[ -z "${ASSET:-}" ]]; then
  echo "Could not auto-detect a Next.js static JS asset from the homepage."
  echo "You can provide one manually, e.g.: /_next/static/chunks/app/users/page-<hash>.js"
  exit 1
fi

URL="https://$DOMAIN$ASSET"
echo "Checking asset: $URL"

# Fetch headers
curl -I --max-time 10 "$URL" || true

# Fetch a small slice to confirm it's JS and not HTML redirect
head -c 200 <(curl -sS --max-time 10 "$URL") | sed 's/.*/HEADER-SAMPLE: &/g' || true

cat <<EOF

What to look for:
- Status: 200 OK
- content-type: application/javascript or text/javascript
- No 301/302 redirects
If you see HTML (e.g., <!DOCTYPE html>), Nginx is misrouting assets. Ensure /_next/static/* is proxied to 127.0.0.1:3000 over HTTPS.
EOF
