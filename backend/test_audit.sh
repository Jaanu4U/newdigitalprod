#!/bin/bash

echo "Getting token for jugeshr@gmail.com..."

# Login and get token
TOKEN_RESPONSE=$(curl -s -X POST "https://jugesh.digitalchain.in/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: 708ebe84-e2af-4d2d-b2bf-9f37ba1a7b65" \
  -d '{"email":"jugeshr@gmail.com","password":"12345678","org_id":"708ebe84-e2af-4d2d-b2bf-9f37ba1a7b65"}')

echo "Login response:"
echo "$TOKEN_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$TOKEN_RESPONSE"

# Extract token
TOKEN=$(echo $TOKEN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo ""
  echo "Failed to get token"
  exit 1
fi

echo ""
echo "Got token: ${TOKEN:0:50}..."
echo ""
echo "Testing audit endpoint..."
echo ""

curl -s "https://jugesh.digitalchain.in/api/v1/admin/orders/audit" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: 708ebe84-e2af-4d2d-b2bf-9f37ba1a7b65" \
  | python3 -m json.tool 2>&1 | head -100

echo ""
echo "====================================="
echo "Summary:"
curl -s "https://jugesh.digitalchain.in/api/v1/admin/orders/audit" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: 708ebe84-e2af-4d2d-b2bf-9f37ba1a7b65" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"Orders found: {len(d.get('orders', []))}\"); print(f\"Summary: {d.get('summary', {})}\") if d.get('orders') else print('No orders in response')"
