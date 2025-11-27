#!/usr/bin/env bash
set -euo pipefail

# Deploy the FastAPI backend on a Linux host with systemd
# - Assumes backend installed at /opt/digitalchain/backend and service name is digitalchain-backend.service
# - Run with sudo

SERVICE="digitalchain-backend.service"
APP_DIR="/opt/digitalchain/backend"
PY_BIN="/usr/bin/python3"
PIP_BIN="/usr/bin/pip3"

echo "==> Deploying Digitalchain Backend"
echo "Service: ${SERVICE}"
echo "App dir: ${APP_DIR}"

if [[ ! -d "${APP_DIR}" ]]; then
  echo "ERROR: ${APP_DIR} not found on this server." >&2
  exit 1
fi

pushd "${APP_DIR}" >/dev/null

if [[ -d .git ]]; then
  echo "==> Updating Git working tree to origin/main"
  sudo -u www-data git fetch --all --prune
  sudo -u www-data git reset --hard origin/main
else
  echo "WARN: ${APP_DIR} is not a git checkout. Skipping git pull/reset."
fi

echo "==> Installing Python dependencies"
${PIP_BIN} install --no-cache-dir -r requirements.txt

echo "==> Restarting service ${SERVICE}"
systemctl restart "${SERVICE}"
sleep 2
systemctl --no-pager --full status "${SERVICE}" || true

popd >/dev/null
echo "==> Done"
