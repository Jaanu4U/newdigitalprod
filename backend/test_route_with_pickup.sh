#!/bin/bash

# Get token
TOKEN=$(curl -s -X POST http://localhost:8000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"swetha.chirras@gmail.com","password":"Jugesh@8790"}' | python3 -c "import sys, json; print(json.load(sys.stdin).get('access_token', ''))")

echo "Token: ${TOKEN:0:50}..."
echo ""

# Test route optimization (will use pickup location from org settings)
echo "=== Testing Route Optimization with Pickup Location ==="
curl -s -X POST http://localhost:8000/v1/rider/optimize-route \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rider_user_id": "baf9e4a3-31fc-4b76-b38f-d2d28cfb45f7",
    "use_google_maps": false
  }' | python3 -c "import sys, json; result=json.load(sys.stdin); print(json.dumps(result, indent=2))"

