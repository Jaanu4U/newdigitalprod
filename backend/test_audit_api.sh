#!/bin/bash

# Test audit API

ORG_ID="708ebe84-e2af-4d2d-b2bf-9f37ba1a7b65"

# Login first
echo "=== Logging in as owner ==="
LOGIN_RESPONSE=$(curl -s -X POST http://127.0.0.1:8000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jugeshr@gmail.com","password":"Admin@123","org_id":"'${ORG_ID}'"}')

echo "Login response: $LOGIN_RESPONSE"

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get token"
  exit 1
fi

echo "✅ Got token: ${TOKEN:0:20}..."

# Call audit API with today's date
TODAY=$(date +%Y-%m-%d)
echo ""
echo "=== Calling audit API for date: $TODAY ==="
curl -s -X GET "http://127.0.0.1:8000/v1/admin/orders/audit?from_date=${TODAY}&to_date=${TODAY}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-slug: jugesh" | jq '.'
