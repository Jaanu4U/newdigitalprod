#!/bin/bash
# Route Optimization Test Script

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       DigitalChain Route Optimization - Status Check       ║"
echo "╔════════════════════════════════════════════════════════════╗"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. Check Backend
echo -e "${BLUE}[1/6]${NC} Checking Backend Service..."
if systemctl is-active --quiet digitalchain-backend; then
    echo -e "  ${GREEN}✓${NC} Backend is running"
else
    echo -e "  ${RED}✗${NC} Backend is not running"
    exit 1
fi

# 2. Check route_optimizer module
echo -e "${BLUE}[2/6]${NC} Checking Route Optimizer Module..."
if [ -f "/home/jugesh/digitalchain/newdigitalprod/backend/app/route_optimizer.py" ]; then
    SIZE=$(stat -c%s "/home/jugesh/digitalchain/newdigitalprod/backend/app/route_optimizer.py")
    echo -e "  ${GREEN}✓${NC} route_optimizer.py exists (${SIZE} bytes)"
else
    echo -e "  ${RED}✗${NC} route_optimizer.py not found"
    exit 1
fi

# 3. Check database column
echo -e "${BLUE}[3/6]${NC} Checking Database Schema..."
cd /home/jugesh/digitalchain/newdigitalprod/backend
source .venv/bin/activate
CHECK_RESULT=$(python3 -c "
from app.db import engine
from sqlalchemy import inspect
inspector = inspect(engine)
cols = [c['name'] for c in inspector.get_columns('deliveries')]
print('route_sequence' in cols)
" 2>/dev/null)

if [ "$CHECK_RESULT" = "True" ]; then
    echo -e "  ${GREEN}✓${NC} route_sequence column exists in deliveries table"
else
    echo -e "  ${YELLOW}⚠${NC}  route_sequence column missing - run migration"
    echo -e "      Run: cd backend && source .venv/bin/activate && python3 scripts/migrate_add_route_sequence.py"
fi

# 4. Check API endpoint
echo -e "${BLUE}[4/6]${NC} Checking Route Optimization Endpoint..."
ENDPOINT_CHECK=$(grep -c "def optimize_rider_route" /home/jugesh/digitalchain/newdigitalprod/backend/app/routers/rider_delivery.py)
if [ "$ENDPOINT_CHECK" -gt 0 ]; then
    echo -e "  ${GREEN}✓${NC} optimize_rider_route endpoint exists"
else
    echo -e "  ${RED}✗${NC} optimize_rider_route endpoint not found"
    exit 1
fi

# 5. Check Admin Portal
echo -e "${BLUE}[5/6]${NC} Checking Admin Portal..."
if systemctl is-active --quiet digitalchain-admin; then
    echo -e "  ${GREEN}✓${NC} Admin Portal is running"
    
    # Check if Optimize Route button exists in code
    BUTTON_CHECK=$(grep -c "Optimize Route" /home/jugesh/digitalchain/newdigitalprod/admin-portal/app/orders/page.tsx)
    if [ "$BUTTON_CHECK" -gt 0 ]; then
        echo -e "  ${GREEN}✓${NC} Optimize Route button exists in code"
    else
        echo -e "  ${YELLOW}⚠${NC}  Optimize Route button not found in code"
    fi
else
    echo -e "  ${RED}✗${NC} Admin Portal is not running"
fi

# 6. Check Android App Model
echo -e "${BLUE}[6/6]${NC} Checking Android App Model..."
ANDROID_CHECK=$(grep -c "routeSequence" /home/jugesh/digitalchain/newdigitalprod/rider-android/app/src/main/java/in/digitalchain/rider/data/model/Delivery.kt 2>/dev/null)
if [ "$ANDROID_CHECK" -gt 0 ]; then
    echo -e "  ${GREEN}✓${NC} routeSequence field exists in Android Delivery model"
else
    echo -e "  ${YELLOW}⚠${NC}  routeSequence field not found in Android model"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    Feature Summary                          ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║                                                             ║"
echo "║  📍 Route Optimizer Module:    route_optimizer.py          ║"
echo "║  🗄️  Database Column:          deliveries.route_sequence    ║"
echo "║  🔌 API Endpoint:              POST /rider/optimize-route  ║"
echo "║  💻 Admin Button:              'Optimize Route' (green)     ║"
echo "║  📱 Android Badge:             Green circular sequence      ║"
echo "║                                                             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${BLUE}Usage Instructions:${NC}"
echo "  1. Go to Orders page in Admin Portal"
echo "  2. Click 'Optimize Route' button (green with map icon)"
echo "  3. Select a rider who has assigned deliveries"
echo "  4. System will optimize and display statistics"
echo "  5. Android app will show numbered badges (1, 2, 3...)"
echo ""
echo -e "${GREEN}✓ Route Optimization Status Check Complete!${NC}"
