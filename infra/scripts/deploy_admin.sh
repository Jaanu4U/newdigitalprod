#!/usr/bin/env bash
# Idempotent deploy script for the Admin Portal on the server
# Usage: sudo bash deploy_admin.sh [/opt/digitalchain/admin-portal] [digitalchain-admin]
set -euo pipefail

APP_DIR=${1:-/opt/digitalchain/admin-portal}
SERVICE=${2:-digitalchain-admin}
RUN_AS=${RUN_AS:-www-data}

echo "==> Stopping service: $SERVICE"
systemctl stop "$SERVICE" || true

cd "$APP_DIR"

echo "==> Cleaning and installing dependencies (user: $RUN_AS)"
su -s /bin/bash -c "rm -rf node_modules .next && npm ci" "$RUN_AS"

echo "==> Building Next.js (user: $RUN_AS)"
su -s /bin/bash -c "npm run build" "$RUN_AS"

echo "==> Build ID:"
cat .next/BUILD_ID || true

echo "==> Users chunk(s):"
ls -l .next/static/chunks/app/users/ || true

echo "==> CSS files:"
ls -l .next/static/css/ || true

echo "==> Starting service: $SERVICE"
systemctl start "$SERVICE"
systemctl status "$SERVICE" --no-pager || true

echo "==> Tail last 30 log lines"
journalctl -u "$SERVICE" -n 30 --no-pager || true

echo "==> Done. Validate assets via:"
echo "    curl -sS https://admin.digitalchain.in/users | grep -oE '/_next/static/[^\"\n]+page-[^\"\n]+\.js' | head -n 1"
echo "    curl -sSI \"https://admin.digitalchain.in<_PATH_FROM_ABOVE_>\" --max-time 15"
