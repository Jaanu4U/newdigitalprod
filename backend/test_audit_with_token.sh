#!/bin/bash

# Test audit API with a real token

echo "Getting token for jugeshr@gmail.com..."

# Login and get token
TOKEN_RESPONSE=$(curl -s -X POST "https://jugesh.digitalchain.in/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: 708ebe84-e2af-4d2d-b2bf-9f37ba1a7b65" \
  -d '{"email":"jugeshr@gmail.com","password":"Test@123","org_id":"708ebe84-e2af-4d2d-b2bf-9f37ba1a7b65"}')

echo "Login response: $TOKEN_RESPONSE"

# Extract token (simple grep, adjust if needed)
TOKEN=$(echo $TOKEN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Failed to get token"
  exit 1
fi

echo "Got token: ${TOKEN:0:50}..."
echo ""
echo "Testing audit endpoint..."

curl -s "https://jugesh.digitalchain.in/api/v1/admin/orders/audit" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: 708ebe84-e2af-4d2d-b2bf-9f37ba1a7b65" \
  | python3 -m json.tool 2>&1 | head -50
