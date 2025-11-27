package in.digitalchain.rider.data

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import in.digitalchain.rider.BuildConfig
import in.digitalchain.rider.data.api.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.time.Instant

class Repository {
    private val api: ApiService by lazy {
        val logger = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
        val auth = okhttp3.Interceptor { chain ->
            val original = chain.request()
            val token = TokenStore.bearer()
            val req = if (token != null) {
                original.newBuilder().addHeader("Authorization", token).build()
            } else original
            chain.proceed(req)
        }
        val client = OkHttpClient.Builder()
            .addInterceptor(auth)
            .addInterceptor(logger)
            .build()
        val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
        val retrofit = Retrofit.Builder()
            .baseUrl(BuildConfig.BASE_URL)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .client(client)
            .build()
        retrofit.create(ApiService::class.java)
    }

    suspend fun login(email: String, password: String, orgId: String, deviceId: String): Result<Unit> = withContext(Dispatchers.IO) {
        return@withContext try {
            val resp = api.login(LoginRequest(email, password, orgId, deviceId))
            TokenStore.setTokens(resp.access_token, resp.refresh_token)
            Result.success(Unit)
        } catch (t: Throwable) {
            Result.failure(t)
        }
    }

    suspend fun getDeliveries(): Result<List<in.digitalchain.rider.data.model.Delivery>> = withContext(Dispatchers.IO) {
        return@withContext try {
            val resp = api.getDeliveries()
            Result.success(resp.items.map { it.toModel() })
        } catch (t: Throwable) {
            Result.failure(t)
        }
    }

    suspend fun updateStatus(id: String, status: String, note: String?): Result<Unit> = withContext(Dispatchers.IO) {
        return@withContext try {
            val now = Instant.now().toString()
            api.updateStatus(id, StatusUpdateRequest(status = status, timestamp = now, note = note))
            Result.success(Unit)
        } catch (t: Throwable) {
            // TODO: queue offline if needed
            Result.failure(t)
        }
    }

    suspend fun uploadPod(id: String, recipientName: String, note: String?): Result<Unit> = withContext(Dispatchers.IO) {
        return@withContext try {
            val now = Instant.now().toString()
            api.uploadPod(id, PodRequest(recipient_name = recipientName, note = note, timestamp = now))
            Result.success(Unit)
        } catch (t: Throwable) {
            // TODO: queue offline if needed
            Result.failure(t)
        }
    }
}

private fun DeliveryDto.toModel(): in.digitalchain.rider.data.model.Delivery =
    in.digitalchain.rider.data.model.Delivery(
        deliveryId = delivery_id,
        orderId = order_id,
        customer = customer,
        address = address,
        status = status
    )
