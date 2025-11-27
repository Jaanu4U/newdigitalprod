package `in`.digitalchain.rider.ui.screens

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.animation.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.*

/**
 * Payment Collection Screen for Riders
 * 
 * Features:
 * - Display order details and amount
 * - Generate and show UPI QR code
 * - Auto-poll payment status
 * - Manual payment confirmation
 * - QR expiry countdown timer
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaymentCollectionScreen(
    deliveryId: String,
    orderId: String,
    customerName: String,
    amount: Double,
    onNavigateBack: () -> Unit,
    viewModel: PaymentCollectionViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    
    LaunchedEffect(deliveryId) {
        viewModel.loadDeliveryDetails(deliveryId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Collect Payment") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when (val state = uiState) {
                is PaymentUiState.Loading -> {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                
                is PaymentUiState.Error -> {
                    ErrorView(
                        message = state.message,
                        onRetry = { viewModel.loadDeliveryDetails(deliveryId) },
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                
                is PaymentUiState.Idle -> {
                    IdlePaymentView(
                        orderId = orderId,
                        customerName = customerName,
                        amount = amount,
                        onCollectPayment = {
                            viewModel.generateQrCode(deliveryId, amount)
                        }
                    )
                }
                
                is PaymentUiState.QrGenerated -> {
                    QrPaymentView(
                        qrData = state.qrData,
                        onCopyUpiLink = {
                            clipboardManager.setText(AnnotatedString(state.qrData.upiString))
                            // Show toast
                        },
                        onRefreshStatus = {
                            viewModel.checkPaymentStatus(state.qrData.paymentId)
                        },
                        onManualConfirm = {
                            viewModel.showManualConfirmDialog()
                        },
                        onCancel = {
                            viewModel.cancelPayment()
                        }
                    )
                }
                
                is PaymentUiState.Success -> {
                    PaymentSuccessView(
                        paymentData = state.paymentData,
                        onDone = onNavigateBack
                    )
                }
                
                is PaymentUiState.ManualConfirmDialog -> {
                    QrPaymentView(
                        qrData = state.qrData,
                        onCopyUpiLink = {
                            clipboardManager.setText(AnnotatedString(state.qrData.upiString))
                        },
                        onRefreshStatus = {
                            viewModel.checkPaymentStatus(state.qrData.paymentId)
                        },
                        onManualConfirm = {
                            viewModel.showManualConfirmDialog()
                        },
                        onCancel = {
                            viewModel.cancelPayment()
                        }
                    )
                    
                    ManualConfirmDialog(
                        amount = amount,
                        onConfirm = { transactionId, method, notes ->
                            viewModel.confirmPaymentManually(
                                state.qrData.paymentId,
                                transactionId,
                                method,
                                notes
                            )
                        },
                        onDismiss = {
                            viewModel.hideManualConfirmDialog()
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun IdlePaymentView(
    orderId: String,
    customerName: String,
    amount: Double,
    onCollectPayment: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Spacer(modifier = Modifier.height(32.dp))
        
        // Payment Icon
        Icon(
            imageVector = Icons.Default.Payments,
            contentDescription = null,
            modifier = Modifier.size(80.dp),
            tint = MaterialTheme.colorScheme.primary
        )
        
        Text(
            text = "Ready to Collect Payment",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Order Details Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.secondaryContainer
            )
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                DetailRow("Order ID", orderId)
                DetailRow("Customer", customerName)
                Divider()
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Amount",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "₹${String.format("%.2f", amount)}",
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
        
        Spacer(modifier = Modifier.weight(1f))
        
        // Collect Payment Button
        Button(
            onClick = onCollectPayment,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary
            )
        ) {
            Icon(Icons.Default.QrCode2, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Generate UPI QR Code", fontSize = 18.sp)
        }
        
        Spacer(modifier = Modifier.height(16.dp))
    }
}

@Composable
fun QrPaymentView(
    qrData: QrData,
    onCopyUpiLink: () -> Unit,
    onRefreshStatus: () -> Unit,
    onManualConfirm: () -> Unit,
    onCancel: () -> Unit
) {
    var timeRemaining by remember { mutableStateOf(calculateTimeRemaining(qrData.expiresAt)) }
    
    LaunchedEffect(qrData.expiresAt) {
        while (timeRemaining > 0) {
            delay(1000)
            timeRemaining = calculateTimeRemaining(qrData.expiresAt)
        }
    }
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Status Badge
        Surface(
            color = if (timeRemaining > 0) Color(0xFF4CAF50) else Color(0xFFF44336),
            shape = RoundedCornerShape(20.dp)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = if (timeRemaining > 0) Icons.Default.Schedule else Icons.Default.ErrorOutline,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(20.dp)
                )
                Text(
                    text = if (timeRemaining > 0) "Waiting for Payment" else "Expired",
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Timer
        if (timeRemaining > 0) {
            Text(
                text = "Expires in ${formatTime(timeRemaining)}",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.error
            )
        } else {
            Text(
                text = "QR Code Expired",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.error,
                fontWeight = FontWeight.Bold
            )
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // QR Code Display
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.White)
                    .padding(16.dp),
                contentAlignment = Alignment.Center
            ) {
                qrData.qrCodeBitmap?.let { bitmap ->
                    Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = "UPI QR Code",
                        modifier = Modifier.fillMaxSize()
                    )
                }
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Amount Display
        Text(
            text = "₹${String.format("%.2f", qrData.amount)}",
            style = MaterialTheme.typography.displayMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary
        )
        
        Text(
            text = "Ask customer to scan and pay",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // UPI Link Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "UPI Link",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = qrData.upiString.take(40) + "...",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
                IconButton(onClick = onCopyUpiLink) {
                    Icon(Icons.Default.ContentCopy, "Copy")
                }
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Action Buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = onRefreshStatus,
                modifier = Modifier.weight(1f)
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Refresh")
            }
            
            Button(
                onClick = onManualConfirm,
                modifier = Modifier.weight(1f)
            ) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Confirm")
            }
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        TextButton(
            onClick = onCancel,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Cancel Payment")
        }
    }
}

@Composable
fun PaymentSuccessView(
    paymentData: PaymentSuccessData,
    onDone: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // Success Animation
        Icon(
            imageVector = Icons.Default.CheckCircle,
            contentDescription = "Success",
            modifier = Modifier.size(120.dp),
            tint = Color(0xFF4CAF50)
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Text(
            text = "Payment Successful!",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF4CAF50)
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = "₹${String.format("%.2f", paymentData.amount)}",
            style = MaterialTheme.typography.displayLarge,
            fontWeight = FontWeight.Bold
        )
        
        Spacer(modifier = Modifier.height(32.dp))
        
        // Payment Details Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.secondaryContainer
            )
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                paymentData.upiTransactionId?.let {
                    DetailRow("Transaction ID", it)
                }
                DetailRow("Payment Method", paymentData.paymentMethod)
                DetailRow(
                    "Time",
                    SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault())
                        .format(Date(paymentData.completedAt))
                )
                paymentData.customerPhone?.let {
                    DetailRow("Customer Phone", it)
                }
            }
        }
        
        Spacer(modifier = Modifier.height(32.dp))
        
        Button(
            onClick = onDone,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
        ) {
            Text("Done", fontSize = 18.sp)
        }
    }
}

@Composable
fun ManualConfirmDialog(
    amount: Double,
    onConfirm: (transactionId: String?, method: String, notes: String?) -> Unit,
    onDismiss: () -> Unit
) {
    var transactionId by remember { mutableStateOf("") }
    var selectedMethod by remember { mutableStateOf("UPI") }
    var notes by remember { mutableStateOf("") }
    val methods = listOf("UPI", "Cash", "Card")
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Confirm Payment Receipt") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(
                    text = "Amount: ₹${String.format("%.2f", amount)}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                
                // Payment Method Selection
                Text("Payment Method:", style = MaterialTheme.typography.labelMedium)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    methods.forEach { method ->
                        FilterChip(
                            selected = selectedMethod == method,
                            onClick = { selectedMethod = method },
                            label = { Text(method) }
                        )
                    }
                }
                
                // Transaction ID (optional for UPI)
                if (selectedMethod == "UPI") {
                    OutlinedTextField(
                        value = transactionId,
                        onValueChange = { transactionId = it },
                        label = { Text("UPI Transaction ID (Optional)") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }
                
                // Notes
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Notes (Optional)") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onConfirm(
                        if (transactionId.isNotBlank()) transactionId else null,
                        selectedMethod,
                        if (notes.isNotBlank()) notes else null
                    )
                }
            ) {
                Text("Confirm Payment")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@Composable
fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
fun ErrorView(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Icon(
            imageVector = Icons.Default.Error,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.error
        )
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center
        )
        Button(onClick = onRetry) {
            Text("Retry")
        }
    }
}

// Helper Functions
private fun calculateTimeRemaining(expiresAt: String): Long {
    return try {
        val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.getDefault())
        format.timeZone = TimeZone.getTimeZone("UTC")
        val expiryTime = format.parse(expiresAt)?.time ?: 0
        val now = System.currentTimeMillis()
        maxOf(0, (expiryTime - now) / 1000)
    } catch (e: Exception) {
        0
    }
}

private fun formatTime(seconds: Long): String {
    val minutes = seconds / 60
    val secs = seconds % 60
    return String.format("%02d:%02d", minutes, secs)
}

// Data Classes
data class QrData(
    val paymentId: String,
    val qrCodeBitmap: android.graphics.Bitmap?,
    val upiString: String,
    val expiresAt: String,
    val amount: Double,
    val status: String
)

data class PaymentSuccessData(
    val paymentId: String,
    val amount: Double,
    val paymentMethod: String,
    val upiTransactionId: String?,
    val completedAt: Long,
    val customerPhone: String?
)

// UI State
sealed class PaymentUiState {
    object Loading : PaymentUiState()
    object Idle : PaymentUiState()
    data class QrGenerated(val qrData: QrData) : PaymentUiState()
    data class ManualConfirmDialog(val qrData: QrData) : PaymentUiState()
    data class Success(val paymentData: PaymentSuccessData) : PaymentUiState()
    data class Error(val message: String) : PaymentUiState()
}
