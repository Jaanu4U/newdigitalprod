package com.digitalchain.rider.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.digitalchain.rider.MainActivity
import com.digitalchain.rider.R
import com.digitalchain.rider.data.LocationTracker
import com.digitalchain.rider.data.Repository
import com.digitalchain.rider.data.WebSocketManager
import com.digitalchain.rider.data.local.AppDatabase
import com.digitalchain.rider.data.local.LocationEntity
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.catch
import java.time.Instant
import kotlin.math.*

class LocationTrackingService : Service() {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var locationTracker: LocationTracker
    private lateinit var webSocketManager: WebSocketManager
    private lateinit var database: AppDatabase
    private lateinit var repository: Repository
    private var trackingJob: Job? = null
    private var syncJob: Job? = null
    private var currentInvoiceId: String? = null
    private var isContinuousTracking = false
    
    // Idle detection
    private var lastMovementLocation: Location? = null
    private var idleStartTime: Long? = null
    private var idleNotificationSent = false
    private val IDLE_RADIUS_METERS = 5.0
    private val IDLE_DURATION_MS = 5 * 60 * 1000L // 5 minutes
    
    override fun onCreate() {
        super.onCreate()
        locationTracker = LocationTracker(this)
        webSocketManager = WebSocketManager.getInstance()
        database = AppDatabase.getDatabase(this)
        repository = Repository()
        createNotificationChannel()
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_TRACKING -> {
                val invoiceId = intent.getStringExtra(EXTRA_INVOICE_ID) ?: return START_NOT_STICKY
                startTracking(invoiceId)
            }
            ACTION_START_CONTINUOUS -> {
                startContinuousTracking()
            }
            ACTION_STOP_TRACKING -> {
                stopTracking()
            }
        }
        return START_STICKY
    }
    
    private fun startTracking(invoiceId: String) {
        if (trackingJob?.isActive == true && !isContinuousTracking) {
            Log.d(TAG, "Location tracking already active")
            return
        }
        
        // Stop continuous tracking if running
        if (isContinuousTracking) {
            trackingJob?.cancel()
            isContinuousTracking = false
        }
        
        currentInvoiceId = invoiceId
        
        // Connect WebSocket
        webSocketManager.connect()
        
        // Start foreground service
        val notification = createNotification("Tracking delivery location")
        startForeground(NOTIFICATION_ID, notification)
        
        // Reset idle detection
        lastMovementLocation = null
        idleStartTime = null
        idleNotificationSent = false
        
        // Start location tracking every 15 seconds for active delivery
        trackingJob = scope.launch {
            locationTracker.trackLocation(intervalMillis = 15000)
                .catch { e ->
                    Log.e(TAG, "Location tracking error", e)
                }
                .collect { (lat, lng) ->
                    Log.d(TAG, "Location update: $lat, $lng")
                    handleLocationUpdate(invoiceId, lat, lng)
                }
        }
        
        // Start background sync job
        startSyncWorker()
        
        Log.i(TAG, "Started location tracking for invoice: $invoiceId")
    }
    
    private fun handleLocationUpdate(invoiceId: String, lat: Double, lng: Double) {
        scope.launch {
            // Save to local database
            val locationEntity = LocationEntity(
                invoiceId = invoiceId,
                latitude = lat,
                longitude = lng,
                timestamp = Instant.now().toString(),
                synced = false
            )
            database.locationDao().insert(locationEntity)
            
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
            
            // Check for idle status
            checkIdleStatus(invoiceId, lat, lng)
        }
    }
    
    private suspend fun checkIdleStatus(invoiceId: String, lat: Double, lng: Double) {
        val currentLocation = Location("").apply {
            latitude = lat
            longitude = lng
        }
        
        val lastLoc = lastMovementLocation
        
        if (lastLoc == null) {
            // First location, start tracking
            lastMovementLocation = currentLocation
            idleStartTime = System.currentTimeMillis()
            idleNotificationSent = false
            return
        }
        
        val distance = lastLoc.distanceTo(currentLocation).toDouble()
        
        if (distance > IDLE_RADIUS_METERS) {
            // Rider moved beyond idle radius, reset
            lastMovementLocation = currentLocation
            idleStartTime = System.currentTimeMillis()
            idleNotificationSent = false
            Log.d(TAG, "Rider moved ${distance}m, resetting idle timer")
        } else {
            // Still within idle radius, check duration
            val idleTime = System.currentTimeMillis() - (idleStartTime ?: System.currentTimeMillis())
            
            if (idleTime >= IDLE_DURATION_MS && !idleNotificationSent) {
                // Rider is idle, notify admin
                Log.w(TAG, "Rider idle for ${idleTime/1000}s within ${distance}m radius")
                sendIdleNotification(invoiceId, lat, lng)
                idleNotificationSent = true
            }
        }
    }
    
    private suspend fun sendIdleNotification(invoiceId: String, lat: Double, lng: Double) {
        try {
            repository.notifyRiderIdle(
                invoiceId = invoiceId,
                latitude = lat,
                longitude = lng,
                idleDurationMinutes = (IDLE_DURATION_MS / 60000).toInt()
            )
            Log.i(TAG, "Idle notification sent to admin")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send idle notification", e)
            // Save for retry if offline
        }
    }
    
    private fun startSyncWorker() {
        syncJob?.cancel()
        syncJob = scope.launch {
            while (isActive) {
                delay(60000L) // Try sync every minute
                trySyncLocations()
            }
        }
    }
    
    private suspend fun trySyncLocations() {
        try {
            val unsyncedLocations = database.locationDao().getUnsyncedLocations(50)
            if (unsyncedLocations.isEmpty()) return
            
            // Group by invoice_id
            val grouped = unsyncedLocations.groupBy { it.invoiceId }
            
            for ((invoiceId, locations) in grouped) {
                val result = repository.syncLocations(
                    invoiceId = invoiceId,
                    locations = locations.map {
                        mapOf(
                            "lat" to it.latitude,
                            "lng" to it.longitude,
                            "timestamp" to it.timestamp
                        )
                    }
                )
                
                if (result.isSuccess) {
                    // Mark as synced
                    database.locationDao().markAsSynced(locations.map { it.id })
                    Log.i(TAG, "Synced ${locations.size} locations for invoice $invoiceId")
                }
            }
            
            // Clean up old synced locations (older than 7 days)
            val sevenDaysAgo = System.currentTimeMillis() - (7 * 24 * 60 * 60 * 1000L)
            database.locationDao().deleteOldSyncedLocations(sevenDaysAgo)
            
        } catch (e: Exception) {
            // Network error, will retry later
            Log.e(TAG, "Location sync failed, will retry", e)
        }
    }
    
    private fun startContinuousTracking() {
        if (trackingJob?.isActive == true && isContinuousTracking) {
            Log.d(TAG, "Continuous tracking already active")
            return
        }
        
        isContinuousTracking = true
        currentInvoiceId = null
        
        // Connect WebSocket
        webSocketManager.connect()
        
        // Start foreground service
        val notification = createNotification("Tracking your location")
        startForeground(NOTIFICATION_ID, notification)
        
        // Start location tracking every 1 minute for continuous tracking
        trackingJob = scope.launch {
            locationTracker.trackLocation(intervalMillis = 60000) // 1 minute
                .catch { e ->
                    Log.e(TAG, "Continuous tracking error", e)
                }
                .collect { (lat, lng) ->
                    Log.d(TAG, "Continuous location update: $lat, $lng")
                    // Send with empty invoice_id for continuous tracking
                    webSocketManager.sendLocationUpdate("", lat, lng)
                }
        }
        
        Log.i(TAG, "Started continuous location tracking")
    }
    
    private fun stopTracking() {
        trackingJob?.cancel()
        trackingJob = null
        syncJob?.cancel()
        syncJob = null
        currentInvoiceId = null
        isContinuousTracking = false
        lastMovementLocation = null
        idleStartTime = null
        idleNotificationSent = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        Log.i(TAG, "Stopped location tracking")
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Delivery Tracking",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Tracks your location during deliveries"
                setShowBadge(false)
            }
            
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }
    
    private fun createNotification(contentText: String): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Digital Chain Rider")
            .setContentText(contentText)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        super.onDestroy()
        trackingJob?.cancel()
        scope.cancel()
        Log.d(TAG, "Service destroyed")
    }
    
    companion object {
        private const val TAG = "LocationTrackingService"
        private const val CHANNEL_ID = "location_tracking"
        private const val NOTIFICATION_ID = 1001
        
        const val ACTION_START_TRACKING = "com.digitalchain.rider.START_TRACKING"
        const val ACTION_START_CONTINUOUS = "com.digitalchain.rider.START_CONTINUOUS"
        const val ACTION_STOP_TRACKING = "com.digitalchain.rider.STOP_TRACKING"
        const val EXTRA_INVOICE_ID = "invoice_id"
        
        fun startTracking(context: Context, invoiceId: String) {
            val intent = Intent(context, LocationTrackingService::class.java).apply {
                action = ACTION_START_TRACKING
                putExtra(EXTRA_INVOICE_ID, invoiceId)
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
        
        fun startContinuousTracking(context: Context) {
            val intent = Intent(context, LocationTrackingService::class.java).apply {
                action = ACTION_START_CONTINUOUS
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
        
        fun stopTracking(context: Context) {
            val intent = Intent(context, LocationTrackingService::class.java).apply {
                action = ACTION_STOP_TRACKING
            }
            context.startService(intent)
        }
    }
}
