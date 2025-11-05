#!/usr/bin/env bash
set -euo pipefail

API_BASE="https://api.digitalchain.in/v1"
EMAIL=""
PASSWORD=""
ORG_ID=""

usage() {
  cat <<EOF
Usage: $0 [-a API_BASE] -e EMAIL -p PASSWORD -o ORG_ID

  -a  API base URL (default: https://api.digitalchain.in/v1)
  -e  Admin email (required)
  -p  Admin password (required)
  -o  Organization ID (required)

Example:
  $0 -e admin@yourdomain.com -p 'A-Strong-Temp-Password' -o 00000000-0000-0000-0000-000000000000
  $0 -a https://api.digitalchain.in/v1 -e admin@yourdomain.com -p 'A-Strong-Temp-Password' -o <org_id>
EOF
}

while getopts ":a:e:p:o:h" opt; do
  case $opt in
    a) API_BASE="$OPTARG" ;;
    e) EMAIL="$OPTARG" ;;
    p) PASSWORD="$OPTARG" ;;
    o) ORG_ID="$OPTARG" ;;
    h) usage; exit 0 ;;
    :) echo "Option -$OPTARG requires an argument" >&2; usage; exit 2 ;;
    \?) echo "Unknown option: -$OPTARG" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "$EMAIL" || -z "$PASSWORD" || -z "$ORG_ID" ]]; then
  echo "Missing required args" >&2
  usage
  exit 2
fi

JSON_PAYLOAD=$(cat <<JSON
{
  "email": "$EMAIL",
  "password": "$PASSWORD",
  "org_id": "$ORG_ID"
}
JSON
)

HTTP_CODE=$(mktemp)
RESP=$(curl -sS -w "%{http_code}" -o >(cat > >(tee /dev/fd/3)) 3> >(cat >/dev/null) \
  -H 'Content-Type: application/json' \
  -d "$JSON_PAYLOAD" \
  "$API_BASE/auth/login")

# RESP contains the HTTP code because of -w; capture it
CODE="$RESP"

# Re-run to capture the body separately (without mixing code)
BODY=$(curl -sS -H 'Content-Type: application/json' -d "$JSON_PAYLOAD" "$API_BASE/auth/login")

echo "=== Prod Admin Login Smoke Test ==="
echo "API_BASE: $API_BASE"
echo "Status: $CODE"

if [[ "$CODE" != "200" ]]; then
  echo "Body:" "$BODY"
  echo "RESULT: FAIL"
  exit 1
fi

# Minimal check without jq: verify access_token key exists
if echo "$BODY" | grep -q '"access_token"'; then
  echo "Tokens: access=present"
  echo "RESULT: PASS"
  exit 0
else
  echo "Body:" "$BODY"
  echo "RESULT: FAIL (access_token not found)"
  exit 1
fi
