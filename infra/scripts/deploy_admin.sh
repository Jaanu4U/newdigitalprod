#!/usr/bin/env bash
# Deploy the Next.js admin portal on a Linux host with systemd
# Usage: sudo /opt/digitalchain/infra/scripts/deploy_admin.sh
set -euo pipefail

SERVICE="digitalchain-admin.service"
APP_DIR="/opt/digitalchain/admin-portal"
RUN_AS="www-data"
NODE_ENV="production"

echo "==> Deploying Digitalchain Admin Portal"
echo "Service: ${SERVICE}"
echo "App dir: ${APP_DIR}"

if [[ ! -d "${APP_DIR}" ]]; then
  echo "ERROR: ${APP_DIR} not found on this server." >&2
  exit 1
fi

echo "==> Stopping service (if running): ${SERVICE}"
systemctl stop "${SERVICE}" || true

pushd "${APP_DIR}" >/dev/null

echo "==> Current build id (if running on localhost:3000)"
set +e
curl -fsS http://localhost:3000/build-id && echo || echo "n/a"
set -e

echo "==> Ensuring ownership for ${RUN_AS}"
chown -R ${RUN_AS}:${RUN_AS} "${APP_DIR}" || true

echo "==> Cleaning previous install/cache"
sudo -u ${RUN_AS} rm -rf node_modules .next || true

echo "==> Installing dependencies"
sudo -u ${RUN_AS} npm ci --no-audit --no-fund

echo "==> Building Next.js"
sudo -u ${RUN_AS} NODE_ENV=${NODE_ENV} npm run -s build

echo "==> Build artifacts"
sudo -u ${RUN_AS} bash -lc 'echo -n "BUILD_ID: "; cat .next/BUILD_ID || true'

echo "==> Starting service ${SERVICE}"
systemctl start "${SERVICE}"
sleep 2
systemctl --no-pager --full status "${SERVICE}" || true

echo "==> New build id (from localhost:3000/build-id if available)"
set +e
curl -fsS http://localhost:3000/build-id && echo || echo "n/a"
set -e

popd >/dev/null
echo "==> Done"
