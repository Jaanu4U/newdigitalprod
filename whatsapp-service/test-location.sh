#!/bin/bash
# Test WhatsApp get-location endpoint

SESSION_ID="6bbe9be3-277c-4dc9-a473-52ce2c4e5c19_jugesh"
PHONE_NUMBER="9849048822"

echo "Testing WhatsApp get-location endpoint..."
echo "Session ID: $SESSION_ID"
echo "Phone Number: $PHONE_NUMBER"
echo ""

curl -X POST http://localhost:3001/api/whatsapp/get-location \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"phoneNumber\": \"$PHONE_NUMBER\"}" \
  2>/dev/null | jq .

echo ""
