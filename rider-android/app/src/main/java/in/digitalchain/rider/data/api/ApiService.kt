package in.digitalchain.rider.data.api

import com.squareup.moshi.JsonClass
import retrofit2.http.*

interface ApiService {
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @GET("rider/deliveries")
    suspend fun getDeliveries(@Query("date") date: String? = null,
                               @Query("status") status: String? = null): DeliveriesResponse

    @GET("rider/deliveries/{id}")
    suspend fun getDelivery(@Path("id") id: String): DeliveryResponse

    @POST("rider/deliveries/{id}/status")
    suspend fun updateStatus(@Path("id") id: String, @Body body: StatusUpdateRequest): StatusUpdateResponse

    @POST("rider/deliveries/{id}/pod")
    suspend fun uploadPod(@Path("id") id: String, @Body body: PodRequest): PodResponse
}

@JsonClass(generateAdapter = true)
data class LoginRequest(
    val email: String,
    val password: String,
    val org_id: String,
    val device_id: String,
    val app_version: String = "0.1.0"
)

@JsonClass(generateAdapter = true)
data class LoginResponse(
    val access_token: String,
    val refresh_token: String,
    val user: UserInfo,
    val org_id: String
)

@JsonClass(generateAdapter = true)
data class UserInfo(val user_id: String, val role: String)

@JsonClass(generateAdapter = true)
data class DeliveriesResponse(val items: List<DeliveryDto>)

@JsonClass(generateAdapter = true)
data class DeliveryResponse(val delivery: DeliveryDto)

@JsonClass(generateAdapter = true)
data class DeliveryDto(
    val delivery_id: String,
    val order_id: String,
    val customer: String,
    val address: String,
    val geo: Geo? = null,
    val eta_window: String? = null,
    val status: String
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
