#!/bin/bash
# Check WhatsApp Service Status

echo "=== WhatsApp Service Status ==="
echo

# Check if process is running
if pgrep -f "node server.js" > /dev/null; then
    PID=$(pgrep -f "node server.js")
    echo "✅ Service is running (PID: $PID)"
else
    echo "❌ Service is NOT running"
    exit 1
fi

# Check if port is listening
if lsof -i :3001 > /dev/null 2>&1; then
    echo "✅ Port 3001 is listening"
else
    echo "❌ Port 3001 is NOT listening"
fi

# Check health endpoint
echo
echo "=== Health Check ==="
HEALTH=$(curl -s http://localhost:3001/health)
if [ $? -eq 0 ]; then
    echo "$HEALTH" | jq . 2>/dev/null || echo "$HEALTH"
else
    echo "❌ Health endpoint not responding"
fi

# List active sessions
echo
echo "=== Active Sessions ==="
curl -s http://localhost:3001/api/whatsapp/sessions | jq '.sessions' 2>/dev/null || curl -s http://localhost:3001/api/whatsapp/sessions

echo
