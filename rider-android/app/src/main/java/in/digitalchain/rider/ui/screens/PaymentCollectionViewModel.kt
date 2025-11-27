package `in`.digitalchain.rider.ui.screens

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.digitalchain.rider.data.Repository
import com.digitalchain.rider.data.model.GenerateQrRequest
import com.digitalchain.rider.data.model.GenerateQrResponse
import com.digitalchain.rider.data.model.PaymentStatusResponse
import com.digitalchain.rider.data.model.ConfirmPaymentRequest
import com.digitalchain.rider.data.model.ConfirmPaymentResponse

/**
 * ViewModel for Payment Collection Screen
 * 
 * Handles:
 * - QR code generation
 * - Payment status polling
 * - Manual payment confirmation
 * - Location tracking
 */
class PaymentCollectionViewModel(
    private val repository: Repository = Repository()
) : ViewModel() {

    private val _uiState = MutableStateFlow<PaymentUiState>(PaymentUiState.Idle)
    val uiState: StateFlow<PaymentUiState> = _uiState.asStateFlow()

    private var statusPollingJob: Job? = null
    private var currentPaymentId: String? = null

    fun loadDeliveryDetails(deliveryId: String) {
        viewModelScope.launch {
            _uiState.value = PaymentUiState.Loading
            try {
                // You can fetch delivery details here if needed
                _uiState.value = PaymentUiState.Idle
            } catch (e: Exception) {
                _uiState.value = PaymentUiState.Error(
                    e.message ?: "Failed to load delivery details"
                )
            }
        }
    }

    fun generateQrCode(deliveryId: String, amount: Double) {
        viewModelScope.launch {
            _uiState.value = PaymentUiState.Loading
            try {
                val result = repository.generatePaymentQr(
                    deliveryId = deliveryId,
                    amount = amount
                )
                
                val response = result.getOrNull()
                val error = result.exceptionOrNull()
                
                if (response != null) {
                    // Decode base64 QR code to bitmap
                    val qrBitmap = decodeBase64ToBitmap(response.qrCode)
                    
                    val qrData = QrData(
                        paymentId = response.paymentId,
                        qrCodeBitmap = qrBitmap,
                        upiString = response.upiString,
                        expiresAt = response.expiresAt,
                        amount = response.amount,
                        status = "pending"
                    )
                    
                    _uiState.value = PaymentUiState.QrGenerated(qrData)
                    currentPaymentId = response.paymentId
                    
                    // Start polling for payment status
                    startPaymentStatusPolling(response.paymentId)
                } else {
                    _uiState.value = PaymentUiState.Error(
                        error?.message ?: "Failed to generate QR code"
                    )
                }
                
            } catch (e: Exception) {
                _uiState.value = PaymentUiState.Error(
                    e.message ?: "Failed to generate QR code"
                )
            }
        }
    }

    fun checkPaymentStatus(paymentId: String) {
        viewModelScope.launch {
            try {
                val result = repository.getPaymentStatus(paymentId)
                val status = result.getOrNull()
                
                if (status != null) {
                    when (status.status) {
                        "success" -> {
                            stopPaymentStatusPolling()
                            _uiState.value = PaymentUiState.Success(
                                PaymentSuccessData(
                                    paymentId = status.paymentId,
                                    amount = status.amount,
                                    paymentMethod = status.paymentMethod ?: "UPI",
                                    upiTransactionId = status.upiTransactionId,
                                    completedAt = parseIsoDate(status.paymentCompletedAt),
                                    customerPhone = null
                                )
                            )
                        }
                        "failed" -> {
                            stopPaymentStatusPolling()
                            _uiState.value = PaymentUiState.Error("Payment failed. Please try again.")
                        }
                        else -> {
                            // Still pending/initiated, keep current state
                        }
                    }
                }
            } catch (e: Exception) {
                // Silently fail status check, don't update UI
                // The polling will retry automatically
            }
        }
    }

    fun confirmPaymentManually(
        paymentId: String,
        transactionId: String?,
        paymentMethod: String,
        notes: String? = null
    ) {
        viewModelScope.launch {
            try {
                val result = repository.confirmPayment(
                    paymentId = paymentId,
                    transactionId = transactionId ?: "",
                    paymentMethod = paymentMethod,
                    notes = notes
                )
                
                val response = result.getOrNull()
                val error = result.exceptionOrNull()
                
                if (response != null) {
                    stopPaymentStatusPolling()
                    _uiState.value = PaymentUiState.Success(
                        PaymentSuccessData(
                            paymentId = response.paymentId,
                            amount = 0.0,
                            paymentMethod = paymentMethod,
                            upiTransactionId = transactionId ?: "",
                            completedAt = System.currentTimeMillis(),
                            customerPhone = null
                        )
                    )
                } else {
                    _uiState.value = PaymentUiState.Error(
                        error?.message ?: "Failed to confirm payment"
                    )
                }
                
            } catch (e: Exception) {
                _uiState.value = PaymentUiState.Error(
                    e.message ?: "Failed to confirm payment"
                )
            }
        }
    }

    fun showManualConfirmDialog() {
        val currentState = _uiState.value
        if (currentState is PaymentUiState.QrGenerated) {
            _uiState.value = PaymentUiState.ManualConfirmDialog(currentState.qrData)
        }
    }

    fun hideManualConfirmDialog() {
        val currentState = _uiState.value
        if (currentState is PaymentUiState.ManualConfirmDialog) {
            _uiState.value = PaymentUiState.QrGenerated(currentState.qrData)
        }
    }

    fun cancelPayment() {
        stopPaymentStatusPolling()
        _uiState.value = PaymentUiState.Idle
        currentPaymentId = null
    }

    private fun startPaymentStatusPolling(paymentId: String) {
        stopPaymentStatusPolling()
        
        statusPollingJob = viewModelScope.launch {
            var attempts = 0
            val maxAttempts = 300 // 15 minutes with 3-second intervals
            var shouldStop = false
            
            while (attempts < maxAttempts && !shouldStop) {
                delay(3000) // Poll every 3 seconds
                
                try {
                    val result = repository.getPaymentStatus(paymentId)
                    val status = result.getOrNull()
                    
                    if (status != null) {
                        when (status.status) {
                            "success" -> {
                                _uiState.value = PaymentUiState.Success(
                                    PaymentSuccessData(
                                        paymentId = status.paymentId,
                                        amount = status.amount,
                                        paymentMethod = status.paymentMethod ?: "UPI",
                                        upiTransactionId = status.upiTransactionId,
                                        completedAt = parseIsoDate(status.paymentCompletedAt),
                                        customerPhone = null
                                    )
                                )
                                shouldStop = true // Stop polling on success
                            }
                            "failed", "cancelled" -> {
                                _uiState.value = PaymentUiState.Error(
                                    "Payment ${status.status}. Please try again."
                                )
                                shouldStop = true // Stop polling on failure
                            }
                            else -> {
                                // Continue polling
                                attempts++
                            }
                        }
                    } else {
                        attempts++
                    }
                } catch (e: Exception) {
                    attempts++
                }
            }
            
            // Timeout
            if (attempts >= maxAttempts) {
                _uiState.value = PaymentUiState.Error(
                    "Payment verification timeout. Please check manually."
                )
            }
        }
    }

    private fun stopPaymentStatusPolling() {
        statusPollingJob?.cancel()
        statusPollingJob = null
    }

    private fun decodeBase64ToBitmap(base64String: String): Bitmap? {
        return try {
            // Remove data:image/png;base64, prefix if present
            val base64Data = if (base64String.startsWith("data:image")) {
                base64String.substring(base64String.indexOf(",") + 1)
            } else {
                base64String
            }
            
            val decodedBytes = Base64.decode(base64Data, Base64.DEFAULT)
            BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
        } catch (e: Exception) {
            null
        }
    }

    private fun parseIsoDate(dateString: String?): Long {
        return try {
            if (dateString == null) return System.currentTimeMillis()
            
            val format = java.text.SimpleDateFormat(
                "yyyy-MM-dd'T'HH:mm:ss'Z'",
                java.util.Locale.getDefault()
            )
            format.timeZone = java.util.TimeZone.getTimeZone("UTC")
            format.parse(dateString)?.time ?: System.currentTimeMillis()
        } catch (e: Exception) {
            System.currentTimeMillis()
        }
    }

    override fun onCleared() {
        super.onCleared()
        stopPaymentStatusPolling()
    }
}
