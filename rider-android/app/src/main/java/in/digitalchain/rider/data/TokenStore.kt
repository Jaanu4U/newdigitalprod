package in.digitalchain.rider.data

object TokenStore {
    @Volatile private var accessToken: String? = null
    @Volatile private var refreshToken: String? = null

    fun setTokens(access: String, refresh: String) {
        accessToken = access
        refreshToken = refresh
        // TODO: persist securely (EncryptedSharedPreferences / DataStore)
    }

    fun bearer(): String? = accessToken?.let { "Bearer $it" }
}
