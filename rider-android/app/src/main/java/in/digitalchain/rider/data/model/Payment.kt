package com.digitalchain.rider.data.model

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class GenerateQrRequest(
    @Json(name = "delivery_id") val deliveryId: String,
    @Json(name = "amount") val amount: Double,
    @Json(name = "collection_latitude") val collectionLatitude: Double? = null,
    @Json(name = "collection_longitude") val collectionLongitude: Double? = null
)

@JsonClass(generateAdapter = true)
data class GenerateQrResponse(
    @Json(name = "payment_id") val paymentId: String,
    @Json(name = "qr_code") val qrCode: String,
    @Json(name = "upi_string") val upiString: String,
    @Json(name = "amount") val amount: Double,
    @Json(name = "order_id") val orderId: String,
    @Json(name = "expires_at") val expiresAt: String,
    @Json(name = "expires_in_seconds") val expiresInSeconds: Int,
    @Json(name = "gateway_order_id") val gatewayOrderId: String? = null
)

@JsonClass(generateAdapter = true)
data class PaymentStatusResponse(
    @Json(name = "payment_id") val paymentId: String,
    @Json(name = "status") val status: String,
    @Json(name = "payment_method") val paymentMethod: String? = null,
    @Json(name = "upi_transaction_id") val upiTransactionId: String? = null,
    @Json(name = "payment_completed_at") val paymentCompletedAt: String? = null,
    @Json(name = "amount") val amount: Double,
    @Json(name = "gateway_payment_id") val gatewayPaymentId: String? = null
)

@JsonClass(generateAdapter = true)
data class ConfirmPaymentRequest(
    @Json(name = "upi_transaction_id") val upiTransactionId: String,
    @Json(name = "payment_method") val paymentMethod: String = "UPI",
    @Json(name = "notes") val notes: String? = null
)

@JsonClass(generateAdapter = true)
data class ConfirmPaymentResponse(
    @Json(name = "payment_id") val paymentId: String,
    @Json(name = "status") val status: String,
    @Json(name = "message") val message: String
)
