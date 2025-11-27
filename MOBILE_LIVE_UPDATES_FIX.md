# Mobile App Live Updates Fix

**Issue:** Mobile app location updates not showing live in admin portal

**Root Cause:** 
- Mobile app was ONLY sending location updates via WebSocket
- Backend WebSocket just relays messages but doesn't save them to database
- Admin portal needs updates saved to database AND broadcasted

**Proper Flow:**
1. Mobile app → REST API `/rider/update-location`
2. Backend saves to database + broadcasts via WebSocket
3. Admin portal receives live update

**Changes Made:**

### 1. Added REST API endpoint to mobile app
**File:** `ApiService.kt`
```kotlin
@POST("rider/update-location")
suspend fun updateLocation(@Body body: UpdateLocationRequest): Map<String, Any>

@JsonClass(generateAdapter = true)
data class UpdateLocationRequest(
    val invoice_id: String,
    val location: LocationPoint,
    val timestamp: String
)
```

### 2. Added Repository method
**File:** `Repository.kt`
```kotlin
suspend fun updateLocation(
    invoiceId: String, 
    latitude: Double, 
    longitude: Double,
    timestamp: String
): Result<Unit> = withContext(Dispatchers.IO) {
    return@withContext try {
        val payload = UpdateLocationRequest(
            invoice_id = invoiceId,
            location = LocationPoint(lat = latitude, lng = longitude),
            timestamp = timestamp
        )
        api.updateLocation(payload)
        Result.success(Unit)
    } catch (e: Exception) {
        Result.failure(e)
    }
}
```

### 3. Updated LocationTrackingService
**File:** `LocationTrackingService.kt`

**Before (WebSocket only):**
```kotlin
// Try to send via WebSocket (if online)
try {
    webSocketManager.sendLocationUpdate(invoiceId, lat, lng)
} catch (e: Exception) {
    Log.e(TAG, "WebSocket send failed, will retry later", e)
}
```

**After (REST API + WebSocket):**
```kotlin
// Send location update to server via REST API
try {
    val timestamp = Instant.now().toString()
    val result = repository.updateLocation(invoiceId, lat, lng, timestamp)
    if (result.isSuccess) {
        Log.d(TAG, "✅ Location update sent to server: $lat, $lng")
    } else {
        Log.w(TAG, "⚠️ Failed to send location update: ${result.exceptionOrNull()?.message}")
    }
} catch (e: Exception) {
    Log.e(TAG, "❌ Location update API failed, will retry later", e)
}

// Also send via WebSocket for real-time updates (optional/redundant but faster)
try {
    webSocketManager.sendLocationUpdate(invoiceId, lat, lng)
} catch (e: Exception) {
    Log.e(TAG, "WebSocket send failed", e)
}
```

## How It Works Now

### Location Update Flow:
1. **Rider app tracks location** every 15 seconds during active delivery
2. **Sends to REST API** → `/v1/rider/update-location`
3. **Backend processes:**
   - Saves to `sync_log` table (type: `rider_location_update`)
   - Broadcasts via WebSocket to all admin portals in same organization
4. **Admin portal receives:**
   - WebSocket message with rider location
   - Updates map markers in real-time
   - Shows in audit page and live tracking

### Database Storage:
```sql
-- Location updates are saved in sync_log table
SELECT 
  id,
  type,
  payload->>'invoice_id' as invoice_id,
  payload->>'latitude' as lat,
  payload->>'longitude' as lng,
  payload->>'rider_email' as rider,
  created_at
FROM sync_log 
WHERE type = 'rider_location_update'
ORDER BY created_at DESC 
LIMIT 10;
```

### WebSocket Message Format:
```json
{
  "type": "rider_location_update",
  "data": {
    "invoice_id": "abc-123-def",
    "rider_email": "rider@example.com",
    "rider_name": "John Rider",
    "latitude": 28.6139,
    "longitude": 77.2090,
    "timestamp": "2025-11-27T12:34:56Z"
  }
}
```

## Build & Deploy

### Debug APK Built:
```bash
cd /opt/digitalchain/rider-android
./gradlew assembleDebug
```

**Output:** `/opt/digitalchain/rider-android/app/build/outputs/apk/debug/app-debug.apk`

### Installation:
1. Transfer APK to mobile device
2. Install (enable "Install from Unknown Sources")
3. Grant location permissions
4. Start delivery to begin location tracking

## Testing

### To verify live updates are working:

1. **Install updated app** on rider device
2. **Start delivery** from rider app
3. **Open admin portal** → `/audit` page
4. **Check browser console:**
   ```
   📨 WebSocket message received: { type: 'rider_location_update', data: {...} }
   ```
5. **Watch map markers** update in real-time
6. **Check database:**
   ```sql
   SELECT COUNT(*) FROM sync_log 
   WHERE type = 'rider_location_update' 
   AND created_at > NOW() - INTERVAL '5 minutes';
   ```

### Mobile App Logs:
```
D/LocationTrackingService: Location update: 28.6139, 77.2090
D/LocationTrackingService: ✅ Location update sent to server: 28.6139, 77.2090
I/WebSocketManager: Location update sent: 28.6139, 77.2090
```

## Status

✅ **Code Changes Complete**
✅ **Debug APK Built Successfully**
⏳ **Needs Testing** - Install APK and test with active delivery

**APK Location:** `/opt/digitalchain/rider-android/app/build/outputs/apk/debug/app-debug.apk`

**Next Steps:**
1. Transfer APK to rider device
2. Install and grant permissions
3. Start a delivery
4. Verify live updates appear in admin portal
5. Check database for location entries

