package com.digitalchain.rider.data.model

data class Delivery(
    val deliveryId: String,
    val orderId: String,
    val customer: String,
    val address: String,
    val status: String,
    val riderStatus: String,
    val latitude: Double?,
    val longitude: Double?,
    val customerPhone: String?,
    val amount: Double?
)
