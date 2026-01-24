# WhatsApp Location Fetch - Troubleshooting Guide

## Issue: Timeout Error (30 seconds)

**Symptoms:**
- WhatsApp location fetch takes 30 seconds and fails
- Error: "WhatsApp service error: " (empty message)
- Browser console shows HTTP 500 after long delay

**Root Cause:**
The WhatsApp Web.js library's `fetchMessages()` operation can be slow when:
1. There are many messages in the chat
2. The WhatsApp client is not properly connected
3. Network latency to WhatsApp servers is high

## Fixes Implemented

### 1. Backend Error Handling (`backend/app/routers/whatsapp.py`)
- ✅ Added specific handling for `TimeoutException` with 504 status
- ✅ Better error message extraction from WhatsApp service
- ✅ Detailed logging of all error types

### 2. WhatsApp Service Improvements (`whatsapp-service/server.js`)
- ✅ Added custom timeout wrapper for async operations
- ✅ Reduced message fetch limit from 100 to 50 (faster response)
- ✅ 10s timeout for `getChats()` operation
- ✅ 15s timeout for `fetchMessages()` operation
- ✅ Better error logging with stack traces

### 3. Frontend User Experience (`admin-portal/app/orders/page.tsx`)
- ✅ User-friendly error messages based on status code
- ✅ Specific guidance for timeout errors
- ✅ Helpful suggestions for different failure scenarios

## How to Use

1. **Ensure WhatsApp Session is Active:**
   ```
   Go to WhatsApp settings page
   Check session status is "ready" or "authenticated"
   ```

2. **Fetch Location:**
   - Click the map pin icon on an order
   - System will search last 50 messages for location
   - Should complete in 15-20 seconds maximum

3. **If Timeout Occurs:**
   - Check WhatsApp session status
   - Try re-initializing the WhatsApp session
   - Restart WhatsApp service: `systemctl restart digitalchain-whatsapp`
   - Ask customer to send location again (fresh message)

## Error Messages Guide

| Error | Meaning | Solution |
|-------|---------|----------|
| **504 Timeout** | Request took >30s | Reconnect WhatsApp session |
| **404 Not Found** | No chat or location | Ensure chat exists, ask for location |
| **400 Bad Request** | Client not ready | Check WhatsApp session status |
| **500 Server Error** | Service crashed | Check logs, restart service |

## Performance Optimization

**Current Limits:**
- Fetch messages: 50 messages max (was 100)
- getChats timeout: 10 seconds
- fetchMessages timeout: 15 seconds
- Total request timeout: 30 seconds

**If Still Slow:**

1. **Reduce message limit further** (whatsapp-service/server.js):
   ```javascript
   const messages = await timeout(
     15000,
     matchingChat.fetchMessages({ limit: 25 }), // Reduced to 25
     'Timeout while fetching messages'
   );
   ```

2. **Increase backend timeout** (backend/app/routers/whatsapp.py):
   ```python
   response = await client.post(
       f"{WHATSAPP_SERVICE_URL}/api/whatsapp/get-location",
       json={...},
       timeout=45.0  # Increased from 30s
   )
   ```

## Monitoring

**Check WhatsApp Service Logs:**
```bash
journalctl -u digitalchain-whatsapp -f
```

**Look for:**
- `[get-location] Fetching chats...` - Should appear quickly
- `[get-location] Retrieved N chats` - Should be <5s
- `[get-location] Fetching messages...` - May take 10-15s
- `[get-location] Location found` - Success!

**Backend Logs:**
```bash
journalctl -u digitalchain-backend -f | grep -i whatsapp
```

## Manual Testing

**Test WhatsApp Service Directly:**
```bash
curl -X POST http://localhost:3001/api/whatsapp/get-location \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "YOUR_SESSION_ID",
    "phoneNumber": "919550303335"
  }'
```

Expected response (success):
```json
{
  "success": true,
  "latitude": 17.385044,
  "longitude": 78.486671,
  "description": "My Location",
  "timestamp": 1736789123
}
```

Expected response (no location):
```json
{
  "success": false,
  "error": "No location found in recent messages..."
}
```

## Common Issues

### 1. Session Disconnected
**Symptom:** "WhatsApp client not ready"  
**Solution:** Re-scan QR code in WhatsApp settings page

### 2. No Chat Found
**Symptom:** "No chat found with this number"  
**Solution:** Send a test message to the customer first

### 3. Old Location Retrieved
**Symptom:** Gets location from weeks ago  
**Solution:** Ask customer to send fresh location, system searches last 50 messages

### 4. Geocoding Failed
**Symptom:** Gets coordinates but no address  
**Solution:** Check Google Maps API key is valid and has Geocoding API enabled

## Support Checklist

When user reports timeout:

- [ ] Check WhatsApp service is running: `systemctl status digitalchain-whatsapp`
- [ ] Check session status in database or WhatsApp page
- [ ] Review service logs for specific error
- [ ] Test with known working phone number
- [ ] Verify network connectivity to WhatsApp servers
- [ ] Check if issue is specific to one customer/chat
- [ ] Try restarting WhatsApp service
- [ ] Verify WhatsApp Web.js version is compatible

---

**Last Updated:** January 13, 2026  
**Related Files:**
- `backend/app/routers/whatsapp.py`
- `whatsapp-service/server.js`
- `admin-portal/app/orders/page.tsx`
