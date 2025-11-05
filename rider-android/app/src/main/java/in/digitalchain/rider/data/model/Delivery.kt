package in.digitalchain.rider.data.model

data class Delivery(
    val deliveryId: String,
    val orderId: String,
    val customer: String,
    val address: String,
    val status: String
)
