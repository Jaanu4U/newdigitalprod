# WhatsApp Service Deployment Guide

## Quick Fix Summary

**Problem:** WhatsApp API endpoints returning 500 errors
**Root Cause:** WhatsApp service (Node.js) was not running on port 3001
**Solution:** Started the WhatsApp service

## What Was Fixed

1. ✅ Created `package.json` with required dependencies
2. ✅ Installed Node.js packages (`whatsapp-web.js`, `express`, etc.)
3. ✅ Started the WhatsApp service on port 3001
4. ✅ Created management scripts (`start.sh`, `stop.sh`, `status.sh`)
5. ✅ Updated `docker-compose.yml` to include WhatsApp service
6. ✅ Added `.gitignore` to protect session data

## Starting the Service

### Method 1: Direct Start (Current)
```bash
cd /home/jugesh/digitalchain/newdigitalprod/whatsapp-service
./start.sh
```

### Method 2: Manual Start
```bash
cd /home/jugesh/digitalchain/newdigitalprod/whatsapp-service
node server.js
```

### Method 3: Docker Compose (Recommended for production)
```bash
cd /home/jugesh/digitalchain/newdigitalprod
docker-compose up -d whatsapp-service
```

## Checking Status

```bash
cd /home/jugesh/digitalchain/newdigitalprod/whatsapp-service
./status.sh
```

Or manually:
```bash
curl http://localhost:3001/health
curl http://localhost:3001/api/whatsapp/sessions
```

## Stopping the Service

```bash
cd /home/jugesh/digitalchain/newdigitalprod/whatsapp-service
./stop.sh
```

## Troubleshooting

### Service won't start
```bash
# Check if port 3001 is in use
lsof -i :3001

# Kill any existing process
pkill -f "node server.js"

# Check logs
tail -f /home/jugesh/digitalchain/newdigitalprod/whatsapp-service/whatsapp-service.log
```

### API still returning 500 errors
1. Verify service is running: `./status.sh`
2. Check backend can reach it: `curl http://localhost:3001/health`
3. Restart backend if needed
4. Clear browser cache and reload the admin portal

### Session issues
```bash
# Clear all WhatsApp sessions
rm -rf /home/jugesh/digitalchain/newdigitalprod/whatsapp-service/.wwebjs_auth/*

# Restart service
./stop.sh && ./start.sh
```

## Auto-start on Boot (Optional)

### Option 1: Create systemd service
```bash
sudo nano /etc/systemd/system/whatsapp-service.service
```

Add:
```ini
[Unit]
Description=Digitalchain WhatsApp Service
After=network.target

[Service]
Type=simple
User=jugesh
WorkingDirectory=/home/jugesh/digitalchain/newdigitalprod/whatsapp-service
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=append:/home/jugesh/digitalchain/newdigitalprod/whatsapp-service/whatsapp-service.log
StandardError=append:/home/jugesh/digitalchain/newdigitalprod/whatsapp-service/whatsapp-service.log

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable whatsapp-service
sudo systemctl start whatsapp-service
sudo systemctl status whatsapp-service
```

### Option 2: Add to crontab
```bash
crontab -e
```

Add:
```bash
@reboot cd /home/jugesh/digitalchain/newdigitalprod/whatsapp-service && ./start.sh
```

## API Endpoints Status

All endpoints should now work:
- ✅ `GET /v1/whatsapp/sessions` - List WhatsApp sessions
- ✅ `POST /v1/whatsapp/init` - Initialize new session
- ✅ `GET /v1/whatsapp/qr/{session_id}` - Get QR code
- ✅ `GET /v1/whatsapp/status/{session_id}` - Get session status
- ✅ `POST /v1/whatsapp/send` - Send message
- ✅ `POST /v1/whatsapp/get-location` - Get location from messages

## Current Status

Service is running with 2 active sessions:
- `6bbe9be3-277c-4dc9-a473-52ce2c4e5c19_jugesh` (ready)
- `28774b60-59b9-417c-9c36-4a0c17995a32_rahul` (waiting for QR scan)

## Next Steps

1. Refresh your browser to clear the 500 errors
2. Try the WhatsApp features in the admin portal
3. Consider setting up auto-start (see above)
4. Monitor logs for any issues

## Files Created/Modified

**New Files:**
- `/whatsapp-service/package.json` - Node.js dependencies
- `/whatsapp-service/start.sh` - Service start script
- `/whatsapp-service/stop.sh` - Service stop script
- `/whatsapp-service/status.sh` - Status check script
- `/whatsapp-service/README.md` - Service documentation
- `/whatsapp-service/.gitignore` - Git ignore rules
- `/whatsapp-service/DEPLOYMENT.md` - This file

**Modified Files:**
- `/docker-compose.yml` - Added WhatsApp service container

## Support

If issues persist:
1. Check logs: `tail -f whatsapp-service/whatsapp-service.log`
2. Verify backend logs for connection errors
3. Ensure no firewall blocking port 3001
4. Check Chrome/Chromium is installed (required by Puppeteer)
