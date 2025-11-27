package com.digitalchain.rider.data

import android.util.Log
import com.digitalchain.rider.BuildConfig
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class WebSocketManager {
    private var webSocket: WebSocket? = null
    private val client = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()
    
    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState
    
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var reconnectJob: Job? = null
    
    sealed class ConnectionState {
        data object Connecting : ConnectionState()
        data object Connected : ConnectionState()
        data object Disconnected : ConnectionState()
        data class Error(val message: String) : ConnectionState()
    }
    
    fun connect() {
        if (webSocket != null) {
            Log.d(TAG, "WebSocket already connected or connecting")
            return
        }
        
        val token = TokenStore.getAccessToken() ?: run {
            Log.w(TAG, "No access token available")
            _connectionState.value = ConnectionState.Error("Not authenticated")
            return
        }
        
        _connectionState.value = ConnectionState.Connecting
        
        // Convert HTTP URL to WebSocket URL
        val wsUrl = BuildConfig.BASE_URL
            .replace("https://", "wss://")
            .replace("http://", "ws://")
            .replace("/v1/", "/ws?token=$token")
        
        Log.d(TAG, "Connecting to WebSocket: ${wsUrl.replace(token, "***")}")
        
        val request = Request.Builder()
            .url(wsUrl)
            .build()
        
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.i(TAG, "WebSocket connected")
                _connectionState.value = ConnectionState.Connected
                reconnectJob?.cancel()
            }
            
            override fun onMessage(webSocket: WebSocket, text: String) {
                Log.d(TAG, "Received message: $text")
                // Handle incoming messages if needed
            }
            
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.w(TAG, "WebSocket closing: $code - $reason")
            }
            
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.w(TAG, "WebSocket closed: $code - $reason")
                _connectionState.value = ConnectionState.Disconnected
                this@WebSocketManager.webSocket = null
                scheduleReconnect()
            }
            
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket error: ${t.message}", t)
                _connectionState.value = ConnectionState.Error(t.message ?: "Connection failed")
                this@WebSocketManager.webSocket = null
                scheduleReconnect()
            }
        })
    }
    
    private fun scheduleReconnect() {
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(5000) // Wait 5 seconds before reconnecting
            if (_connectionState.value !is ConnectionState.Connected) {
                Log.d(TAG, "Attempting to reconnect...")
                connect()
            }
        }
    }
    
    fun sendLocationUpdate(invoiceId: String, latitude: Double, longitude: Double) {
        val ws = webSocket
        if (ws == null) {
            Log.w(TAG, "Cannot send location: WebSocket not connected")
            return
        }
        
        val riderEmail = TokenStore.getRiderEmail() ?: run {
            Log.w(TAG, "Cannot send location: No rider email")
            return
        }
        
        try {
            val message = JSONObject().apply {
                put("type", "rider_location_update")
                put("data", JSONObject().apply {
                    put("invoice_id", invoiceId)
                    put("rider_email", riderEmail)
                    put("latitude", latitude)
                    put("longitude", longitude)
                    put("timestamp", System.currentTimeMillis()) // Send in milliseconds
                })
            }
            
            val success = ws.send(message.toString())
            if (success) {
                Log.d(TAG, "Location update sent: $latitude, $longitude")
            } else {
                Log.w(TAG, "Failed to send location update")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error sending location update", e)
        }
    }
    
    fun disconnect() {
        reconnectJob?.cancel()
        webSocket?.close(1000, "User disconnected")
        webSocket = null
        _connectionState.value = ConnectionState.Disconnected
    }
    
    fun cleanup() {
        disconnect()
        scope.cancel()
    }
    
    companion object {
        private const val TAG = "WebSocketManager"
        
        @Volatile
        private var INSTANCE: WebSocketManager? = null
        
        fun getInstance(): WebSocketManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: WebSocketManager().also { INSTANCE = it }
            }
        }
    }
}
