package com.digitalchain.rider.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update

@Dao
interface PendingActionDao {
    @Insert
    suspend fun insert(action: PendingActionEntity): Long

    @Query("SELECT * FROM pending_actions ORDER BY createdAt ASC LIMIT :limit")
    suspend fun loadPending(limit: Int = 50): List<PendingActionEntity>

    @Query("UPDATE pending_actions SET attemptCount = attemptCount + 1, lastAttemptAt = :timestamp WHERE id = :id")
    suspend fun recordAttempt(id: Long, timestamp: Long)

    @Query("DELETE FROM pending_actions WHERE id = :id")
    suspend fun delete(id: Long)

    @Query("DELETE FROM pending_actions WHERE attemptCount >= :maxAttempts")
    suspend fun dropFailed(maxAttempts: Int = 5)
}
