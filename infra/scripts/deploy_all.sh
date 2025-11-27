#!/usr/bin/env bash
set -euo pipefail

# Deploy both Admin Portal (Next.js) and Backend (FastAPI) sequentially.
# Run this as root/sudo on the server.

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)

echo "==> Deploying Admin Portal"
"${DIR}/deploy_admin.sh"

echo "\n==> Deploying Backend"
"${DIR}/deploy_backend.sh"

echo "\n==> Deployment complete"
