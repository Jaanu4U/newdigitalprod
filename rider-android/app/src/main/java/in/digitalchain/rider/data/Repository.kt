package com.digitalchain.rider.data

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import com.digitalchain.rider.BuildConfig
import com.digitalchain.rider.data.api.*
import com.digitalchain.rider.data.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.time.Instant

class Repository {
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
        val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
        val retrofit = Retrofit.Builder()
            .baseUrl(BuildConfig.BASE_URL)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .client(client)
            .build()
        retrofit.create(ApiService::class.java)
    }

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
                // Only add if not already present (by orderId)
                if (allDeliveries.none { it.orderId == dto.invoice_no }) {
                    allDeliveries.add(dto.toModel())
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

    suspend fun updateStatus(id: String, status: String, note: String?): Result<Unit> = withContext(Dispatchers.IO) {
        return@withContext try {
            val now = Instant.now().toString()
            api.updateStatus(id, StatusUpdateRequest(status = status, timestamp = now, note = note))
            Result.success(Unit)
        } catch (t: Throwable) {
            // TODO: queue offline if needed
            Result.failure(t)
        }
    }

    suspend fun uploadPod(id: String, recipientName: String, note: String?): Result<Unit> = withContext(Dispatchers.IO) {
        return@withContext try {
            val now = Instant.now().toString()
            api.uploadPod(id, PodRequest(recipient_name = recipientName, note = note, timestamp = now))
            Result.success(Unit)
        } catch (t: Throwable) {
            // TODO: queue offline if needed
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
    
    suspend fun uploadPodImage(
        invoiceId: String,
        imageBytes: ByteArray,
        fileName: String = "pod_image.jpg"
    ): Result<String> = withContext(Dispatchers.IO) {
        return@withContext try {
            val requestBody = okhttp3.RequestBody.create(
                "image/jpeg".toMediaTypeOrNull(),
                imageBytes
            )
            val part = okhttp3.MultipartBody.Part.createFormData(
                "file",
                fileName,
                requestBody
            )
            val response = api.uploadPodImage(invoiceId, part)
            Result.success(response.image_url)
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
        customerPhone = customer_phone
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
        address = shipping_address ?: customer_address,  // Use shipping_address if available, otherwise customer_address
        status = status,
        riderStatus = rider_status,
        latitude = lat,
        longitude = lng,
        customerPhone = customer_phone
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
