#!/usr/bin/env bash
set -euo pipefail

DOMAIN_ROOT="${1:-digitalchain.in}"
ORG_SLUG="${2:-acme}"

urls=(
  "https://${DOMAIN_ROOT}/"
  "https://${DOMAIN_ROOT}/signup"
  "https://${ORG_SLUG}.digitalchain.in/login"
)

for u in "${urls[@]}"; do
  echo "-- $u"
  code=$(curl -o /dev/null -s -w "%{http_code}" "$u")
  ctype=$(curl -sI "$u" | awk -F': ' 'tolower($1)=="content-type"{print $2}' | tr -d '\r')
  echo "   status: $code, content-type: ${ctype:-n/a}"
  if [[ "$code" != 200 && "$code" != 302 && "$code" != 301 ]]; then
    echo "   WARN: unexpected status" >&2
  fi
  sleep 0.2
done
