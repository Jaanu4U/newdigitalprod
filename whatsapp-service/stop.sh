#!/bin/bash
# WhatsApp Service Stop Script

echo "Stopping WhatsApp service..."

# Find and kill the process
pkill -f "node server.js"

if [ $? -eq 0 ]; then
    echo "✅ WhatsApp service stopped"
else
    echo "⚠️  No WhatsApp service process found"
fi

# Wait a moment and verify it stopped
sleep 1
if pgrep -f "node server.js" > /dev/null; then
    echo "⚠️  Process still running, forcing kill..."
    pkill -9 -f "node server.js"
fi
