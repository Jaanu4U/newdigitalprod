package com.digitalchain.rider.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update

@Dao
interface LocationDao {
    @Insert
    suspend fun insert(location: LocationEntity): Long
    
    @Query("SELECT * FROM location_updates WHERE synced = 0 ORDER BY createdAt ASC LIMIT :limit")
    suspend fun getUnsyncedLocations(limit: Int = 100): List<LocationEntity>
    
    @Query("UPDATE location_updates SET synced = 1 WHERE id IN (:ids)")
    suspend fun markAsSynced(ids: List<Long>)
    
    @Query("DELETE FROM location_updates WHERE synced = 1 AND createdAt < :timestamp")
    suspend fun deleteOldSyncedLocations(timestamp: Long)
    
    @Query("SELECT COUNT(*) FROM location_updates WHERE synced = 0")
    suspend fun getUnsyncedCount(): Int
    
    @Query("SELECT * FROM location_updates WHERE invoiceId = :invoiceId ORDER BY createdAt DESC LIMIT :limit")
    suspend fun getLocationsForInvoice(invoiceId: String, limit: Int = 50): List<LocationEntity>
}
