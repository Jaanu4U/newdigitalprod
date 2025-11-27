package com.digitalchain.rider.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "location_updates")
data class LocationEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val invoiceId: String,
    val latitude: Double,
    val longitude: Double,
    val timestamp: String,
    val synced: Boolean = false,
    val createdAt: Long = System.currentTimeMillis()
)
