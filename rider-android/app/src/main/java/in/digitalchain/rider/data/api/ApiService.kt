package com.digitalchain.rider.data.api

import com.squareup.moshi.JsonClass
import retrofit2.http.*

interface ApiService {
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @GET("org/lookup")
    suspend fun lookupOrg(
        @Query("slug") slug: String? = null,
        @Query("domain") domain: String? = null,
        @Query("access_key") accessKey: String? = null
    ): OrgLookupResponse

    @GET("org/lookup-by-email")
    suspend fun lookupOrgByEmail(@Query("email") email: String): OrgLookupResponse

    @GET("rider/assigned-orders")
    suspend fun getAssignedOrders(): AssignedOrdersResponse

    @GET("rider/deliveries")
    suspend fun getDeliveries(@Query("date") date: String? = null,
                               @Query("status") status: String? = null): DeliveriesResponse

    @GET("rider/deliveries/{id}")
    suspend fun getDelivery(@Path("id") id: String): DeliveryResponse

    @POST("rider/deliveries/{id}/status")
    suspend fun updateStatus(@Path("id") id: String, @Body body: StatusUpdateRequest): StatusUpdateResponse

    @POST("rider/deliveries/{id}/pod")
    suspend fun uploadPod(@Path("id") id: String, @Body body: PodRequest): PodResponse
    
    @Multipart
    @POST("rider/upload-pod-image")
    suspend fun uploadPodImage(
        @Query("invoice_id") invoiceId: String,
        @Part file: okhttp3.MultipartBody.Part
    ): PodImageUploadResponse
    
    @POST("rider/accept-order")
    suspend fun acceptOrder(@Body body: AcceptOrderRequest): Map<String, Any>
    
    @POST("rider/reject-order")
    suspend fun rejectOrder(@Body body: Map<String, String>): Map<String, Any>
    
    @POST("rider/start-delivery")
    suspend fun startDelivery(@Body body: StartDeliveryRequest): Map<String, Any>
    
    @POST("rider/complete-delivery")
    suspend fun completeDelivery(@Body body: CompleteDeliveryRequest): Map<String, Any>
    
    @GET("org/maps-api-key")
    suspend fun getGoogleMapsApiKey(): GoogleMapsApiKeyResponse
    
    @GET("org/geocode")
    suspend fun geocodeAddress(@Query("address") address: String): GeocodeResponse
    
    @GET("org/estimated-time")
    suspend fun getEstimatedTime(
        @Query("origin_lat") originLat: Double,
        @Query("origin_lng") originLng: Double,
        @Query("dest_lat") destLat: Double,
        @Query("dest_lng") destLng: Double
    ): EstimatedTimeResponse
    
    @POST("rider/update-location")
    suspend fun updateLocation(@Body body: UpdateLocationRequest): Map<String, Any>
    
    @POST("rider/sync-locations")
    suspend fun syncLocations(@Body body: SyncLocationsRequest): Map<String, Any>
    
    @POST("rider/notify-idle")
    suspend fun notifyRiderIdle(@Body body: RiderIdleNotification): Map<String, Any>
    
    // Payment APIs
    @POST("payment/generate-qr")
    suspend fun generatePaymentQr(@Body body: com.digitalchain.rider.data.model.GenerateQrRequest): com.digitalchain.rider.data.model.GenerateQrResponse
    
    @GET("payment/{payment_id}/status")
    suspend fun getPaymentStatus(@Path("payment_id") paymentId: String): com.digitalchain.rider.data.model.PaymentStatusResponse
    
    @POST("payment/{payment_id}/confirm")
    suspend fun confirmPayment(
        @Path("payment_id") paymentId: String,
        @Body body: com.digitalchain.rider.data.model.ConfirmPaymentRequest
    ): com.digitalchain.rider.data.model.ConfirmPaymentResponse
}

@JsonClass(generateAdapter = true)
data class LoginRequest(
    val email: String,
    val password: String,
    val org_id: String? = null
)

@JsonClass(generateAdapter = true)
data class LoginResponse(
    val access_token: String,
    val refresh_token: String,
    val user: UserInfo,
    val org_id: String
)

@JsonClass(generateAdapter = true)
data class OrgLookupResponse(
    val org_id: String,
    val name: String,
    val slug: String?,
    val custom_domain: String?
)

@JsonClass(generateAdapter = true)
data class UserInfo(
    val user_id: String, 
    val role: String,
    val email: String? = null
)

@JsonClass(generateAdapter = true)
data class DeliveriesResponse(val items: List<DeliveryDto>)

@JsonClass(generateAdapter = true)
data class DeliveryResponse(val delivery: DeliveryDto)

@JsonClass(generateAdapter = true)
data class AssignedOrdersResponse(val orders: List<AssignedOrderDto>, val count: Int)

@JsonClass(generateAdapter = true)
data class AssignedOrderDto(
    val invoice_id: String,
    val invoice_no: String,
    val customer_name: String,
    val customer_address: String,
    val customer_phone: String,
    val delivery_latitude: Any?,
    val delivery_longitude: Any?,
    val shipping_address: String?,
    val status: String,
    val rider_status: String
)

@JsonClass(generateAdapter = true)
data class DeliveryDto(
    val delivery_id: String,
    val order_id: String,
    val customer: String,
    val address: String,
    val status: String,
    val rider_status: String,
    val customer_phone: String?,
    val latitude: Any?,
    val longitude: Any?,
    val geo: Geo? = null,
    val eta_window: String? = null
)

@JsonClass(generateAdapter = true)
data class Geo(val lat: Double, val lng: Double)

@JsonClass(generateAdapter = true)
data class StatusUpdateRequest(
    val status: String,
    val timestamp: String,
    val location: LocationPoint? = null,
    val note: String? = null
)

@JsonClass(generateAdapter = true)
data class LocationPoint(val lat: Double, val lng: Double, val accuracy: Double? = null)

@JsonClass(generateAdapter = true)
data class StatusUpdateResponse(val status: String, val delivery_id: String, val new_status: String)

@JsonClass(generateAdapter = true)
data class PodRequest(
    val recipient_name: String,
    val note: String? = null,
    val timestamp: String
)

@JsonClass(generateAdapter = true)
data class PodResponse(val status: String, val pod_id: String)

@JsonClass(generateAdapter = true)
data class GoogleMapsApiKeyResponse(val google_api_key: String)

@JsonClass(generateAdapter = true)
data class GeocodeResponse(
    val status: String,
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val formatted_address: String? = null,
    val message: String? = null
)

@JsonClass(generateAdapter = true)
data class StartDeliveryRequest(
    val invoice_id: String,
    val location: LocationPoint
)

@JsonClass(generateAdapter = true)
data class CompleteDeliveryRequest(
    val invoice_id: String,
    val location: LocationPoint,
    val payment: PaymentPayload
)

@JsonClass(generateAdapter = true)
data class PaymentPayload(
    val method: String,
    val cash_amount: Double? = null,
    val upi_id: String? = null,
    val card_last4: String? = null
)

@JsonClass(generateAdapter = true)
data class PodImageUploadResponse(
    val status: String,
    val image_url: String
)

@JsonClass(generateAdapter = true)
data class EstimatedTimeResponse(
    val status: String,
    val duration_minutes: Int? = null,
    val duration_text: String? = null,
    val distance_km: Double? = null,
    val distance_text: String? = null,
    val message: String? = null
)

@JsonClass(generateAdapter = true)
data class AcceptOrderRequest(
    val invoice_id: String,
    val estimated_minutes: Int? = null
)

@JsonClass(generateAdapter = true)
data class UpdateLocationRequest(
    val invoice_id: String,
    val location: LocationPoint,
    val timestamp: String
)

@JsonClass(generateAdapter = true)
data class SyncLocationsRequest(
    val invoice_id: String,
    val locations: List<Map<String, Any>>
)

@JsonClass(generateAdapter = true)
data class RiderIdleNotification(
    val invoice_id: String,
    val latitude: Double,
    val longitude: Double,
    val idle_duration_minutes: Int
)


