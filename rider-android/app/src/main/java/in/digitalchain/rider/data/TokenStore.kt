package com.digitalchain.rider.data

import android.content.Context
import android.content.SharedPreferences

object TokenStore {
    @Volatile private var accessToken: String? = null
    @Volatile private var refreshToken: String? = null
    @Volatile private var riderEmail: String? = null
    private var prefs: SharedPreferences? = null
    private const val PREFS_NAME = "rider_prefs"
    private const val KEY_ACCESS_TOKEN = "access_token"
    private const val KEY_REFRESH_TOKEN = "refresh_token"
    private const val KEY_RIDER_EMAIL = "rider_email"

    fun init(context: Context) {
        if (prefs == null) {
            prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            // Load saved tokens
            accessToken = prefs?.getString(KEY_ACCESS_TOKEN, null)
            refreshToken = prefs?.getString(KEY_REFRESH_TOKEN, null)
            riderEmail = prefs?.getString(KEY_RIDER_EMAIL, null)
        }
    }

    fun setTokens(access: String, refresh: String, email: String? = null) {
        accessToken = access
        refreshToken = refresh
        if (email != null) {
            riderEmail = email
        }
        // Persist to SharedPreferences
        prefs?.edit()?.apply {
            putString(KEY_ACCESS_TOKEN, access)
            putString(KEY_REFRESH_TOKEN, refresh)
            if (email != null) {
                putString(KEY_RIDER_EMAIL, email)
            }
            apply()
        }
    }

    fun bearer(): String? = accessToken?.let { "Bearer $it" }
    
    fun getAccessToken(): String? = accessToken
    
    fun getRiderEmail(): String? = riderEmail
    
    fun setRiderEmail(email: String) {
        riderEmail = email
        prefs?.edit()?.putString(KEY_RIDER_EMAIL, email)?.apply()
    }
    
    fun clearTokens() {
        accessToken = null
        refreshToken = null
        riderEmail = null
        // Clear from SharedPreferences
        prefs?.edit()?.apply {
            remove(KEY_ACCESS_TOKEN)
            remove(KEY_REFRESH_TOKEN)
            remove(KEY_RIDER_EMAIL)
            apply()
        }
    }
    
    fun isLoggedIn(): Boolean = accessToken != null
}
