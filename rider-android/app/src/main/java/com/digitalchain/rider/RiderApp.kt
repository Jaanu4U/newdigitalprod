package com.digitalchain.rider

import android.app.Application
import android.content.Context
import com.digitalchain.rider.data.TokenStore

class RiderApp : Application() {
    override fun onCreate() {
        super.onCreate()
        instance = this
        TokenStore.init(applicationContext)
    }

    companion object {
        @Volatile
        private var instance: RiderApp? = null

        val appContext: Context
            get() = instance?.applicationContext
                ?: throw IllegalStateException("RiderApp not initialized")
    }
}
