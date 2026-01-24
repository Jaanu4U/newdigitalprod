package com.digitalchain.rider.data

import com.digitalchain.rider.BuildConfig
import com.digitalchain.rider.RiderApp
import com.digitalchain.rider.data.api.*
import com.digitalchain.rider.data.local.AppDatabase
import com.digitalchain.rider.data.local.PendingActionEntity
import com.digitalchain.rider.data.model.*
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.io.File
import java.io.IOException
import java.time.Instant

class Repository {
    private val moshi: Moshi by lazy {
        Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
    }

    private val api: ApiService by lazy {
        val logger = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BODY }
        val auth = okhttp3.Interceptor { chain ->
            val original = chain.request()
            val token = TokenStore.bearer()
            val req = if (token != null) {
                original.newBuilder().addHeader("Authorization", token).build()
            } else original
            chain.proceed(req)
        }
        val client = OkHttpClient.Builder()
            .addInterceptor(auth)
            .addInterceptor(logger)
            .cache(null)  // Disable caching
            .build()
        val retrofit = Retrofit.Builder()
            .baseUrl(BuildConfig.BASE_URL)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .client(client)
            .build()
        retrofit.create(ApiService::class.java)
    }

    private val database by lazy { AppDatabase.getDatabase(RiderApp.appContext) }
    private val pendingDao by lazy { database.pendingActionDao() }
    private val queueMutex = Mutex()

    private val statusPayloadAdapter by lazy { moshi.adapter(StatusUpdatePayload::class.java) }
    private val podPayloadAdapter by lazy { moshi.adapter(PodSubmissionPayload::class.java) }
    private val podImagePayloadAdapter by lazy { moshi.adapter(PodImagePayload::class.java) }

    suspend fun resolveOrgId(email: String): Result<String> = withContext(Dispatchers.IO) {
        val normalized = email.trim().lowercase()
        if (normalized.isEmpty()) {
            return@withContext Result.failure(Exception("Email is required"))
        }
        return@withContext try {
            val resp = api.lookupOrgByEmail(normalized)
            Result.success(resp.org_id)
        } catch (e: retrofit2.HttpException) {
            val errorMessage = when (e.code()) {
                400 -> "Email is invalid"
                404 -> "Account not found"
                else -> "Server error: ${e.message}"
            }
            Result.failure(Exception(errorMessage))
        } catch (t: Throwable) {
            Result.failure(Exception("Unable to resolve account: ${t.message}"))
        }
    }

    suspend fun login(email: String, password: String, orgId: String): Result<Unit> = withContext(Dispatchers.IO) {
        return@withContext try {
            val resp = api.login(LoginRequest(email, password, orgId))
            TokenStore.setTokens(resp.access_token, resp.refresh_token, email)
            Result.success(Unit)
        } catch (e: retrofit2.HttpException) {
            val errorBody = e.response()?.errorBody()?.string()
            val errorMessage = when (e.code()) {
                401 -> "Invalid credentials"
                403 -> "Email not verified. Please contact your administrator"
                400 -> "Invalid request: ${errorBody ?: "Bad request"}"
                else -> "Server error: ${e.message}"
            }
            Result.failure(Exception(errorMessage))
        } catch (e: java.net.UnknownHostException) {
            Result.failure(Exception("Network error: Unable to reach server"))
        } catch (e: java.io.IOException) {
            Result.failure(Exception("Network error: ${e.message}"))
        } catch (t: Throwable) {
            Result.failure(Exception("Login failed: ${t.message}"))
        }
    }

    suspend fun getDeliveries(): Result<List<com.digitalchain.rider.data.model.Delivery>> = withContext(Dispatchers.IO) {
        return@withContext try {
            // Try both endpoints and merge
            val deliveriesResp = try { api.getDeliveries() } catch (e: Exception) { null }
            val assignedResp = try { api.getAssignedOrders() } catch (e: Exception) { null }
            
            val allDeliveries = mutableListOf<com.digitalchain.rider.data.model.Delivery>()
            
            deliveriesResp?.items?.forEach { dto ->
                allDeliveries.add(dto.toModel())
            }

            assignedResp?.orders?.forEach { dto ->
                val mapped = dto.toModel()
                // If already present from /deliveries, replace it with richer assigned-orders data
                val existingIndex = allDeliveries.indexOfFirst { it.orderId == mapped.orderId }
                if (existingIndex >= 0) {
                    allDeliveries[existingIndex] = mapped
                } else {
                    allDeliveries.add(mapped)
                }
            }
            
            android.util.Log.d("Repository", "Merged ${allDeliveries.size} deliveries")
            allDeliveries.forEach { 
                android.util.Log.d("Repository", "Merged Delivery: id=${it.deliveryId}, lat=${it.latitude}, lng=${it.longitude}")
            }
            
            Result.success(allDeliveries)
        } catch (t: Throwable) {
            Result.failure(t)
        }
    }

    suspend fun getOrderDetail(invoiceId: String): Result<Map<String, Any>> = withContext(Dispatchers.IO) {
        return@withContext try {
            android.util.Log.d("OrderAmount", "Fetching order detail for: $invoiceId")
            val orderDetail = api.getOrderDetail(invoiceId)
            android.util.Log.d("OrderAmount", "API Response: $orderDetail")
            Result.success(orderDetail)
        } catch (e: retrofit2.HttpException) {
            android.util.Log.e("OrderAmount", "HTTP Error: ${e.code()} - ${e.message()}")
            Result.failure(Exception("Failed to fetch order details: ${e.message}"))
        } catch (t: Throwable) {
            android.util.Log.e("OrderAmount", "Network Error: ${t.message}", t)
            Result.failure(Exception("Network error: ${t.message}"))
        }
    }

    suspend fun updateStatus(id: String, status: String, note: String?): Result<Unit> = withContext(Dispatchers.IO) {
        val timestamp = Instant.now().toString()
        flushPendingActions()
        return@withContext try {
            api.updateStatus(id, StatusUpdateRequest(status = status, timestamp = timestamp, note = note))
            flushPendingActions()
            Result.success(Unit)
        } catch (io: IOException) {
            enqueueStatusUpdate(StatusUpdatePayload(id, status, note, timestamp))
            Result.failure(OfflineQueueException("Status update queued; will sync when online"))
        } catch (http: HttpException) {
            if (http.code() in 500..599) {
                enqueueStatusUpdate(StatusUpdatePayload(id, status, note, timestamp))
                Result.failure(OfflineQueueException("Status update queued; will sync when online"))
            } else {
                Result.failure(http)
            }
        } catch (t: Throwable) {
            Result.failure(t)
        }
    }

    suspend fun uploadPod(id: String, recipientName: String, note: String?): Result<Unit> = withContext(Dispatchers.IO) {
        val timestamp = Instant.now().toString()
        flushPendingActions()
        return@withContext try {
            api.uploadPod(id, PodRequest(recipient_name = recipientName, note = note, timestamp = timestamp))
            flushPendingActions()
            Result.success(Unit)
        } catch (io: IOException) {
            enqueuePodSubmission(PodSubmissionPayload(id, recipientName, note, timestamp))
            Result.failure(OfflineQueueException("Proof of delivery queued; will sync when online"))
        } catch (http: HttpException) {
            if (http.code() in 500..599) {
                enqueuePodSubmission(PodSubmissionPayload(id, recipientName, note, timestamp))
                Result.failure(OfflineQueueException("Proof of delivery queued; will sync when online"))
            } else {
                Result.failure(http)
            }
        } catch (t: Throwable) {
            Result.failure(t)
        }
    }
    
    suspend fun acceptOrder(invoiceId: String, estimatedMinutes: Int? = null): Result<Unit> = withContext(Dispatchers.IO) {
        return@withContext try {
            val request = AcceptOrderRequest(
                invoice_id = invoiceId,
                estimated_minutes = estimatedMinutes
            )
            api.acceptOrder(request)
            Result.success(Unit)
        } catch (t: Throwable) {
            Result.failure(t)
        }
    }
    
    suspend fun rejectOrder(invoiceId: String): Result<Unit> = withContext(Dispatchers.IO) {
        return@withContext try {
            api.rejectOrder(mapOf("invoice_id" to invoiceId))
            Result.success(Unit)
        } catch (t: Throwable) {
            Result.failure(t)
        }
    }
    
    suspend fun startDelivery(invoiceId: String, location: Pair<Double, Double>): Result<Unit> = withContext(Dispatchers.IO) {
        return@withContext try {
            val payload = StartDeliveryRequest(
                invoice_id = invoiceId,
                location = LocationPoint(lat = location.first, lng = location.second)
            )
            api.startDelivery(payload)
            Result.success(Unit)
        } catch (t: Throwable) {
            Result.failure(t)
        }
    }
    
    suspend fun completeDelivery(
        invoiceId: String, 
        location: Pair<Double, Double>, 
        payment: Map<String, Any?>
    ): Result<Unit> = withContext(Dispatchers.IO) {
        return@withContext try {
            val paymentPayload = PaymentPayload(
                method = payment["method"] as? String? ?: "cash",
                cash_amount = (payment["cash_amount"] as? Number)?.toDouble(),
                upi_id = payment["upi_id"] as? String,
                card_last4 = payment["card_last4"] as? String
            )
            val payload = CompleteDeliveryRequest(
                invoice_id = invoiceId,
                location = LocationPoint(lat = location.first, lng = location.second),
                payment = paymentPayload
            )
            api.completeDelivery(payload)
            Result.success(Unit)
        } catch (t: Throwable) {
            Result.failure(t)
        }
    }

    suspend fun cancelDelivery(invoiceId: String, reason: String): Result<Unit> = withContext(Dispatchers.IO) {
        return@withContext try {
            val request = CancelDeliveryRequest(
                invoice_id = invoiceId,
                reason = reason
            )
            api.cancelDelivery(request)
            Result.success(Unit)
        } catch (t: Throwable) {
            Result.failure(t)
        }
    }
    
    suspend fun uploadPodImage(
        invoiceId: String,
        imageBytes: ByteArray,
        fileName: String = "pod_image.jpg"
    ): Result<String> = withContext(Dispatchers.IO) {
        flushPendingActions()
        return@withContext try {
            val requestBody = imageBytes.toRequestBody("image/jpeg".toMediaTypeOrNull())
            val part = okhttp3.MultipartBody.Part.createFormData(
                "file",
                fileName,
                requestBody
            )
            val response = api.uploadPodImage(invoiceId, part)
            flushPendingActions()
            Result.success(response.image_url)
        } catch (io: IOException) {
            return@withContext queuePodImageOffline(invoiceId, fileName, imageBytes, "image/jpeg")
        } catch (http: HttpException) {
            if (http.code() in 500..599) {
                return@withContext queuePodImageOffline(invoiceId, fileName, imageBytes, "image/jpeg")
            } else {
                Result.failure(http)
            }
        } catch (t: Throwable) {
            Result.failure(t)
        }
    }
    
    suspend fun getGoogleMapsApiKey(): Result<String> = withContext(Dispatchers.IO) {
        return@withContext try {
            val resp = api.getGoogleMapsApiKey()
            Result.success(resp.google_api_key)
        } catch (t: Throwable) {
            Result.failure(t)
        }
    }
    
    suspend fun geocodeAddress(address: String): Result<Pair<Double, Double>> = withContext(Dispatchers.IO) {
        return@withContext try {
            val resp = api.geocodeAddress(address)
            if (resp.status == "ok") {
                Result.success(Pair(resp.latitude, resp.longitude))
            } else {
                Result.failure(Exception(resp.message ?: "Geocoding failed"))
            }
        } catch (t: Throwable) {
            Result.failure(t)
        }
    }
    
    suspend fun getEstimatedDeliveryTime(
        originLat: Double,
        originLng: Double,
        destLat: Double,
        destLng: Double
    ): Result<Pair<Int, Double>> = withContext(Dispatchers.IO) {
        return@withContext try {
            val resp = api.getEstimatedTime(originLat, originLng, destLat, destLng)
            if (resp.status == "ok" && resp.duration_minutes != null) {
                val distance = resp.distance_km ?: 0.0
                Result.success(Pair(resp.duration_minutes, distance))
            } else {
                Result.failure(Exception(resp.message ?: "Unable to calculate estimated time"))
            }
        } catch (t: Throwable) {
            Result.failure(t)
        }
    }
    
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
    
    suspend fun syncLocations(invoiceId: String, locations: List<Map<String, Any>>): Result<Unit> = withContext(Dispatchers.IO) {
        return@withContext try {
            val payload = SyncLocationsRequest(
                invoice_id = invoiceId,
                locations = locations
            )
            api.syncLocations(payload)
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun notifyRiderIdle(
        invoiceId: String,
        latitude: Double,
        longitude: Double,
        idleDurationMinutes: Int
    ): Result<Unit> = withContext(Dispatchers.IO) {
        return@withContext try {
            val payload = RiderIdleNotification(
                invoice_id = invoiceId,
                latitude = latitude,
                longitude = longitude,
                idle_duration_minutes = idleDurationMinutes
            )
            api.notifyRiderIdle(payload)
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend fun flushPendingActions(limit: Int = 25) {
        val pending = queueMutex.withLock { pendingDao.loadPending(limit) }
        if (pending.isEmpty()) return

        for (action in pending) {
            when (processPendingAction(action)) {
                ActionProcessResult.SUCCESS -> queueMutex.withLock { pendingDao.delete(action.id) }
                ActionProcessResult.DROP -> queueMutex.withLock { pendingDao.delete(action.id) }
                ActionProcessResult.RETRY_LATER -> {
                    queueMutex.withLock {
                        pendingDao.recordAttempt(action.id, System.currentTimeMillis())
                    }
                    break
                }
            }
        }

        queueMutex.withLock { pendingDao.dropFailed(MAX_QUEUE_ATTEMPTS) }
    }

    private suspend fun processPendingAction(action: PendingActionEntity): ActionProcessResult {
        val type = runCatching { PendingActionType.valueOf(action.actionType) }.getOrElse {
            return ActionProcessResult.DROP
        }

        return try {
            when (type) {
                PendingActionType.STATUS_UPDATE -> {
                    val payload = statusPayloadAdapter.fromJson(action.payload) ?: return ActionProcessResult.DROP
                    api.updateStatus(
                        payload.deliveryId,
                        StatusUpdateRequest(
                            status = payload.status,
                            timestamp = payload.timestamp,
                            note = payload.note
                        )
                    )
                    ActionProcessResult.SUCCESS
                }

                PendingActionType.POD_SUBMIT -> {
                    val payload = podPayloadAdapter.fromJson(action.payload) ?: return ActionProcessResult.DROP
                    api.uploadPod(
                        payload.deliveryId,
                        PodRequest(
                            recipient_name = payload.recipientName,
                            note = payload.note,
                            timestamp = payload.timestamp
                        )
                    )
                    ActionProcessResult.SUCCESS
                }

                PendingActionType.POD_IMAGE -> {
                    val payload = podImagePayloadAdapter.fromJson(action.payload) ?: return ActionProcessResult.DROP
                    val file = File(payload.filePath)
                    if (!file.exists()) {
                        return ActionProcessResult.DROP
                    }
                    val requestBody = file.asRequestBody(payload.mimeType.toMediaTypeOrNull())
                    val part = okhttp3.MultipartBody.Part.createFormData("file", payload.fileName, requestBody)
                    api.uploadPodImage(payload.deliveryId, part)
                    file.delete()
                    ActionProcessResult.SUCCESS
                }
            }
        } catch (io: IOException) {
            ActionProcessResult.RETRY_LATER
        } catch (http: HttpException) {
            if (http.code() in 500..599) ActionProcessResult.RETRY_LATER else ActionProcessResult.DROP
        } catch (t: Throwable) {
            ActionProcessResult.DROP
        }
    }

    private suspend fun enqueueStatusUpdate(payload: StatusUpdatePayload) {
        queueMutex.withLock {
            pendingDao.insert(
                PendingActionEntity(
                    actionType = PendingActionType.STATUS_UPDATE.name,
                    targetId = payload.deliveryId,
                    payload = statusPayloadAdapter.toJson(payload)
                )
            )
        }
    }

    private suspend fun enqueuePodSubmission(payload: PodSubmissionPayload) {
        queueMutex.withLock {
            pendingDao.insert(
                PendingActionEntity(
                    actionType = PendingActionType.POD_SUBMIT.name,
                    targetId = payload.deliveryId,
                    payload = podPayloadAdapter.toJson(payload)
                )
            )
        }
    }

    private suspend fun enqueuePodImage(payload: PodImagePayload) {
        queueMutex.withLock {
            pendingDao.insert(
                PendingActionEntity(
                    actionType = PendingActionType.POD_IMAGE.name,
                    targetId = payload.deliveryId,
                    payload = podImagePayloadAdapter.toJson(payload)
                )
            )
        }
    }

    private suspend fun queuePodImageOffline(
        invoiceId: String,
        fileName: String,
        bytes: ByteArray,
        mimeType: String
    ): Result<String> {
        return try {
            val payload = persistImageForOffline(invoiceId, fileName, bytes, mimeType)
            enqueuePodImage(payload)
            Result.failure(OfflineQueueException("POD image queued; will upload when online"))
        } catch (error: Throwable) {
            Result.failure(error)
        }
    }

    private fun persistImageForOffline(
        invoiceId: String,
        fileName: String,
        bytes: ByteArray,
        mimeType: String
    ): PodImagePayload {
        val cacheDir = File(RiderApp.appContext.cacheDir, "pod_queue")
        if (!cacheDir.exists() && !cacheDir.mkdirs()) {
            throw IOException("Unable to prepare cache directory for offline POD")
        }
        val offlineFile = File(cacheDir, "${invoiceId}_${System.currentTimeMillis()}_$fileName")
        offlineFile.writeBytes(bytes)
        return PodImagePayload(
            deliveryId = invoiceId,
            filePath = offlineFile.absolutePath,
            fileName = offlineFile.name,
            mimeType = mimeType
        )
    }

    private enum class ActionProcessResult {
        SUCCESS,
        RETRY_LATER,
        DROP
    }

    private enum class PendingActionType {
        STATUS_UPDATE,
        POD_SUBMIT,
        POD_IMAGE
    }

    @JsonClass(generateAdapter = true)
    data class StatusUpdatePayload(
        val deliveryId: String,
        val status: String,
        val note: String?,
        val timestamp: String
    )

    @JsonClass(generateAdapter = true)
    data class PodSubmissionPayload(
        val deliveryId: String,
        val recipientName: String,
        val note: String?,
        val timestamp: String
    )

    @JsonClass(generateAdapter = true)
    data class PodImagePayload(
        val deliveryId: String,
        val filePath: String,
        val fileName: String,
        val mimeType: String
    )

    companion object {
        private const val MAX_QUEUE_ATTEMPTS = 6
    }

    private fun DeliveryDto.toModel(): com.digitalchain.rider.data.model.Delivery {
    val lat = when (latitude) {
        is Double -> latitude
        is String -> latitude.toDoubleOrNull()
        else -> null
    }
    val lng = when (longitude) {
        is Double -> longitude
        is String -> longitude.toDoubleOrNull()
        else -> null
    }
    
    return com.digitalchain.rider.data.model.Delivery(
        deliveryId = delivery_id,
        orderId = order_id,
        customer = customer,
        address = address,
        status = status,
        riderStatus = rider_status,
        latitude = lat ?: geo?.lat,
        longitude = lng ?: geo?.lng,
        customerPhone = customer_phone,
        amount = amount,
        routeSequence = null  // Not available in this endpoint
    )
    }

    private fun AssignedOrderDto.toModel(): com.digitalchain.rider.data.model.Delivery {
    val lat = when (delivery_latitude) {
        is Double -> delivery_latitude
        is String -> delivery_latitude.toDoubleOrNull()
        else -> null
    }
    val lng = when (delivery_longitude) {
        is Double -> delivery_longitude
        is String -> delivery_longitude.toDoubleOrNull()
        else -> null
    }

    return com.digitalchain.rider.data.model.Delivery(
        deliveryId = invoice_id,
        orderId = invoice_no,
        customer = customer_name,
        address = delivery_address ?: shipping_address ?: customer_address,  // Use delivery_address (final), then shipping, then billing
        status = status,
        riderStatus = rider_status,
        latitude = lat,
        longitude = lng,
        customerPhone = customer_phone,
        amount = amount,
        routeSequence = route_sequence  // Optimized sequence from backend
    )
    }

    // Payment Methods
    suspend fun generatePaymentQr(
        deliveryId: String,
        amount: Double,
        latitude: Double? = null,
        longitude: Double? = null
    ): Result<com.digitalchain.rider.data.model.GenerateQrResponse> = withContext(Dispatchers.IO) {
        return@withContext try {
            val request = com.digitalchain.rider.data.model.GenerateQrRequest(
                deliveryId = deliveryId,
                amount = amount,
                collectionLatitude = latitude,
                collectionLongitude = longitude
            )
            val response = api.generatePaymentQr(request)
            Result.success(response)
        } catch (e: retrofit2.HttpException) {
            val errorMessage = when (e.code()) {
                404 -> "Delivery not found"
                400 -> "Invalid payment request"
                else -> "Server error: ${e.message}"
            }
            Result.failure(Exception(errorMessage))
        } catch (t: Throwable) {
            Result.failure(Exception("Failed to generate QR: ${t.message}"))
        }
    }

    suspend fun getPaymentStatus(paymentId: String): Result<com.digitalchain.rider.data.model.PaymentStatusResponse> = withContext(Dispatchers.IO) {
        return@withContext try {
            val response = api.getPaymentStatus(paymentId)
            Result.success(response)
        } catch (e: retrofit2.HttpException) {
            Result.failure(Exception("Failed to check payment status: ${e.message}"))
        } catch (t: Throwable) {
            Result.failure(Exception("Network error: ${t.message}"))
        }
    }

    suspend fun confirmPayment(
        paymentId: String,
        transactionId: String,
        paymentMethod: String = "UPI",
        notes: String? = null
    ): Result<com.digitalchain.rider.data.model.ConfirmPaymentResponse> = withContext(Dispatchers.IO) {
        return@withContext try {
            val request = com.digitalchain.rider.data.model.ConfirmPaymentRequest(
                upiTransactionId = transactionId,
                paymentMethod = paymentMethod,
                notes = notes
            )
            val response = api.confirmPayment(paymentId, request)
            Result.success(response)
        } catch (e: retrofit2.HttpException) {
            Result.failure(Exception("Failed to confirm payment: ${e.message}"))
        } catch (t: Throwable) {
            Result.failure(Exception("Network error: ${t.message}"))
        }
    }
}
