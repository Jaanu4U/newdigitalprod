# WhatsApp Service

Node.js service for WhatsApp Web integration using whatsapp-web.js library.

## Features

- Multi-session support (organization-specific sessions)
- QR code generation for authentication
- Send messages via WhatsApp
- Retrieve location data from WhatsApp messages
- Session management (list, status, logout)
- **Auto-restore sessions on restart** - Sessions automatically reconnect when service restarts

## Requirements

- Node.js 18+ 
- npm
- Chrome/Chromium (installed automatically by Puppeteer)

## Installation

```bash
npm install
```

## Usage

### Start Service

```bash
./start.sh
# OR
node server.js
```

The service will run on port 3001 by default.

**Note:** Existing WhatsApp sessions will automatically reconnect within 10-15 seconds after startup.

### Stop Service

```bash
./stop.sh
```

### Check Status

```bash
./status.sh
# OR
curl http://localhost:3001/health
```

### Test Location Retrieval

```bash
./test-location.sh
```

## API Endpoints

- `GET /health` - Health check
- `POST /api/whatsapp/init` - Initialize WhatsApp session
- `GET /api/whatsapp/qr/:sessionId` - Get QR code for session
- `GET /api/whatsapp/status/:sessionId` - Get session status
- `GET /api/whatsapp/sessions` - List all sessions
- `POST /api/whatsapp/send` - Send WhatsApp message
- `POST /api/whatsapp/get-location` - Get location from WhatsApp messages
- `POST /api/whatsapp/logout` - Logout from session

## Session Storage

WhatsApp sessions are stored in the `.wwebjs_auth` directory and persist across restarts.

## Logs

Logs are written to `whatsapp-service.log` when started with `start.sh`.

View logs:
```bash
tail -f whatsapp-service.log
```

## Integration

This service is used by the Digitalchain backend API at `/v1/whatsapp/*` endpoints.

Backend configuration:
```python
WHATSAPP_SERVICE_URL = "http://localhost:3001"
```

## Troubleshooting

### Service won't start
- Check if port 3001 is already in use: `lsof -i :3001`
- Check logs: `tail -f whatsapp-service.log`

### Sessions not restoring after restart
- Check if session files exist: `ls -la .wwebjs_auth/`
- Wait 15-20 seconds for auto-reconnection
- Check logs for authentication errors

### QR code not showing
- Wait a few seconds after initializing a session
- Check session status endpoint
- If QR expired, logout and reinitialize the session

### Messages not sending
- Verify session is authenticated and ready
- Check that phone number format is correct (10 digits or with country code)

### Location not found errors
Common solutions:
1. **"No chat found with this number"** - Make sure you have an existing WhatsApp conversation with this contact
2. **"No location found in recent messages"** - Ask the customer to share their location via WhatsApp first
3. The service searches the last 100 messages for location data

### Phone Number Format
The service automatically handles various formats:
- `9849048822` (10 digits) → assumes India (+91) → `919849048822@c.us`
- `919849048822` (with country code) → `919849048822@c.us`
- `+919849048822` → `919849048822@c.us`

## Recent Improvements (Dec 18, 2025)

1. ✅ **Auto-restore sessions** - Sessions now automatically reconnect on service restart
2. ✅ **Improved location retrieval** - Better phone number handling and error messages
3. ✅ **Enhanced logging** - Detailed logs for debugging location issues
4. ✅ **Better error handling** - Clear error messages when chat or location not found

## Security Note

This service runs locally and should not be exposed to the public internet. It's designed to be accessed only by the backend API server.
