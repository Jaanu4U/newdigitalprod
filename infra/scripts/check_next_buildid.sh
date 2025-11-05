#!/usr/bin/env bash
set -euo pipefail

DOMAIN=${1:-admin.digitalchain.in}

HTML=$(curl -sS --max-time 10 "https://$DOMAIN/") || true
# Try to find a buildId reference used by Next (/_next/static/<BUILD_ID>/_buildManifest.js)
BUILDID=$(echo "$HTML" | grep -oE "/_next/static/[A-Za-z0-9_-]+/_buildManifest\.js" | head -n1 | awk -F'/' '{print $(NF-1)}' || true)

if [[ -z "${BUILDID:-}" ]]; then
  echo "Could not detect BUILD_ID from homepage HTML. Try an internal page like /users."
  HTML=$(curl -sS --max-time 10 "https://$DOMAIN/users") || true
  BUILDID=$(echo "$HTML" | grep -oE "/_next/static/[A-Za-z0-9_-]+/_buildManifest\.js" | head -n1 | awk -F'/' '{print $(NF-1)}' || true)
fi

if [[ -z "${BUILDID:-}" ]]; then
  echo "Still could not detect BUILD_ID. The page may be missing script tags or blocking assets."
  exit 1
fi

echo "Detected remote BUILD_ID: $BUILDID"

# Probe the build manifest directly
URL="https://$DOMAIN/_next/static/$BUILDID/_buildManifest.js"
 echo "Fetching: $URL"
 curl -sS -I --max-time 10 "$URL" || true

cat <<EOF

If status is 200, the remote build ID is valid on the server. If 404/400, the server isn't serving this build.
On the server, check local build ID:

  cat /opt/digitalchain/admin-portal/.next/BUILD_ID

Restart the Next service after rebuilding to align remote and local build IDs.
EOF
