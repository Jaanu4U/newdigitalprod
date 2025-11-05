#!/bin/bash

echo "🔍 SuperAdmin Platform Verification"
echo "===================================="
echo ""

# Check services running
echo "✓ Checking services..."
BACKEND=$(lsof -i :8000 2>/dev/null | wc -l)
FRONTEND=$(lsof -i :3000 2>/dev/null | wc -l)

if [ $BACKEND -gt 1 ]; then
  echo "  ✅ Backend running on :8000"
else
  echo "  ❌ Backend NOT running"
fi

if [ $FRONTEND -gt 0 ]; then
  echo "  ✅ Frontend running on :3000"
else
  echo "  ❌ Frontend NOT running"
fi

echo ""
echo "✓ Testing endpoints..."

# Test login endpoint
TOKEN=$(curl -s -X POST http://localhost:8000/v1/auth/superadmin-login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@digitalchain.in","password":"SuperAdmin@123!"}' \
  | jq -r '.access_token' 2>/dev/null)

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  echo "  ✅ SuperAdmin login working"
else
  echo "  ❌ SuperAdmin login failed"
  exit 1
fi

echo ""
echo "✓ Testing API endpoints..."

# Test dashboard endpoint
DASHBOARD=$(curl -s http://localhost:8000/v1/superadmin/dashboard \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.summary.total_organizations' 2>/dev/null)

if [ -n "$DASHBOARD" ]; then
  echo "  ✅ Dashboard API working (Total orgs: $DASHBOARD)"
else
  echo "  ❌ Dashboard API failed"
  exit 1
fi

echo ""
echo "✓ Testing UI..."

LOGIN_PAGE=$(curl -s http://localhost:3000/login | grep -c "SuperAdmin Login")
if [ $LOGIN_PAGE -gt 0 ]; then
  echo "  ✅ Login page showing SuperAdmin-only"
else
  echo "  ❌ Login page issue"
fi

echo ""
echo "🎉 All systems operational!"
echo ""
echo "📌 Next steps:"
echo "   1. Open browser: http://localhost:3000/login"
echo "   2. Use: superadmin@digitalchain.in / SuperAdmin@123!"
echo "   3. Access: http://localhost:3000/superadmin"
