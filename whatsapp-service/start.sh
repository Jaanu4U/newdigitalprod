#!/bin/bash
# WhatsApp Service Startup Script

cd /home/jugesh/digitalchain/newdigitalprod/whatsapp-service

# Check if already running
if pgrep -f "node server.js" > /dev/null; then
    echo "WhatsApp service is already running"
    exit 0
fi

# Start the service
nohup node server.js > whatsapp-service.log 2>&1 &
PID=$!

echo "WhatsApp service started with PID: $PID"
echo "Log file: whatsapp-service.log"

# Wait a bit and verify it started
sleep 2
if curl -s http://localhost:3001/health > /dev/null; then
    echo "✅ WhatsApp service is running successfully on port 3001"
else
    echo "❌ WhatsApp service failed to start. Check whatsapp-service.log"
    exit 1
fi
