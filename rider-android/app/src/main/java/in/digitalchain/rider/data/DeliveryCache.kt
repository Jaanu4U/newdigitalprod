package com.digitalchain.rider.data

/**
 * Simple in-memory cache so riders don't have to capture their location
 * again when they reopen a delivery detail screen before starting.
 */
object DeliveryCache {
    private val capturedLocations = mutableMapOf<String, Pair<Double, Double>>()

    @Synchronized
    fun saveCapturedLocation(deliveryId: String, coords: Pair<Double, Double>) {
        capturedLocations[deliveryId] = coords
    }

    @Synchronized
    fun clearCapturedLocation(deliveryId: String) {
        capturedLocations.remove(deliveryId)
    }

    @Synchronized
    fun getCapturedLocation(deliveryId: String): Pair<Double, Double>? = capturedLocations[deliveryId]
}
