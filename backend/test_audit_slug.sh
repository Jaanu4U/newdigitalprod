#!/bin/bash

echo "Testing with X-Org header (slug)..."

# Login
TOKEN_RESPONSE=$(curl -s -X POST "https://jugesh.digitalchain.in/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Org: jugesh" \
  -d '{"email":"jugeshr@gmail.com","password":"12345678","org_id":"708ebe84-e2af-4d2d-b2bf-9f37ba1a7b65"}')

TOKEN=$(echo $TOKEN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Failed to get token"
  echo "$TOKEN_RESPONSE"
  exit 1
fi

echo "Got token, testing audit endpoint with X-Org header..."

curl -s "https://jugesh.digitalchain.in/api/v1/admin/orders/audit" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Org: jugesh" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"Orders: {len(d.get('orders', []))}\"); print(json.dumps(d, indent=2)[:500])"
