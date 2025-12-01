package com.digitalchain.rider.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CameraAlt
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Navigation
import androidx.compose.material.icons.outlined.PendingActions
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.QrCode2
import androidx.compose.material.icons.outlined.UploadFile
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import android.util.Base64
import com.digitalchain.rider.data.DeliveryCache
import com.digitalchain.rider.service.LocationTrackingService
import com.google.android.gms.location.LocationServices
import com.digitalchain.rider.data.Repository
import com.digitalchain.rider.data.model.Delivery
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

// Helper function for image compression
fun compressImage(bitmap: Bitmap): Bitmap {
    val maxDimension = 1920
    var width = bitmap.width
    var height = bitmap.height
    
    if (width > height && width > maxDimension) {
        height = (height * maxDimension) / width
        width = maxDimension
    } else if (height > maxDimension) {
        width = (width * maxDimension) / height
        height = maxDimension
    }
    
    val scaled = Bitmap.createScaledBitmap(bitmap, width, height, true)
    val outputStream = ByteArrayOutputStream()
    scaled.compress(Bitmap.CompressFormat.JPEG, 80, outputStream)
    
    return BitmapFactory.decodeByteArray(outputStream.toByteArray(), 0, outputStream.size())

}


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeliveryDetailScreen(
    deliveryId: String,
    onBack: () -> Unit,
    onStatusChanged: () -> Unit = {}
) {
    val ctx = LocalContext.current
    val repo = remember { Repository() }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val textFieldColors = TextFieldDefaults.colors(
        focusedIndicatorColor = MaterialTheme.colorScheme.primary,
        unfocusedIndicatorColor = MaterialTheme.colorScheme.outline,
        disabledIndicatorColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f),
        cursorColor = MaterialTheme.colorScheme.primary,
        focusedContainerColor = MaterialTheme.colorScheme.surface,
        unfocusedContainerColor = MaterialTheme.colorScheme.surface,
        disabledContainerColor = MaterialTheme.colorScheme.surface
    )

    var delivery by remember { mutableStateOf<Delivery?>(null) }
    var loading by remember { mutableStateOf(true) }
    var riderStatus by remember { mutableStateOf("") }
    var location by remember { mutableStateOf<Pair<Double, Double>?>(DeliveryCache.getCapturedLocation(deliveryId)) }
    var manualLat by remember { mutableStateOf("") }
    var manualLng by remember { mutableStateOf("") }
    var showManualEntry by remember { mutableStateOf(false) }
    var locationLoading by remember { mutableStateOf(false) }

    var geocoding by remember { mutableStateOf(false) }

    var paymentMethod by remember { mutableStateOf("cash") }
    var cashAmount by remember { mutableStateOf("") }
    var upiId by remember { mutableStateOf("") }
    var cardLast4 by remember { mutableStateOf("") }
    
    // Payment QR state
    var qrCodeBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var paymentId by remember { mutableStateOf<String?>(null) }
    var upiString by remember { mutableStateOf("") }
    var qrGenerating by remember { mutableStateOf(false) }
    var paymentStatus by remember { mutableStateOf<String?>(null) }
    var paymentCompleted by remember { mutableStateOf(false) }
    var transactionId by remember { mutableStateOf<String?>(null) }
    var paymentCompletedAt by remember { mutableStateOf<String?>(null) }

    var capturedImage by remember { mutableStateOf<Bitmap?>(null) }
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    var showEstimateDialog by remember { mutableStateOf(false) }
    var estimatedMinutes by remember { mutableStateOf("30") }
    var estimatedDistance by remember { mutableStateOf("") }
    var calculatingEstimate by remember { mutableStateOf(false) }
    
    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicturePreview()
    ) { bitmap ->
        bitmap?.let { capturedImage = compressImage(it) }
    }
    val galleryLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        uri?.let {
            runCatching {
                val bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    val source = ImageDecoder.createSource(ctx.contentResolver, it)
                    ImageDecoder.decodeBitmap(source)
                } else {
                    @Suppress("DEPRECATION")
                    MediaStore.Images.Media.getBitmap(ctx.contentResolver, it)
                }
                capturedImage = compressImage(bitmap)
            }.onFailure { error ->
                scope.launch {
                    snackbarHostState.showSnackbar(error.message ?: "Unable to load image")
                }
            }
        }
    }
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
        if (granted) {
            cameraLauncher.launch(null)
        }
    }

    val persistLocation: (Pair<Double, Double>) -> Unit = remember(deliveryId) {
        {
            location = it
            DeliveryCache.saveCapturedLocation(deliveryId, it)
        }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            scope.launch {
                locationLoading = true
                try {
                    val fusedLocationClient = LocationServices.getFusedLocationProviderClient(ctx)
                    val loc = fusedLocationClient.lastLocation.await()
                    loc?.let { persistLocation(Pair(it.latitude, it.longitude)) }
                } catch (e: Exception) {
                    showManualEntry = true
                } finally {
                    locationLoading = false
                }
            }
        } else {
            showManualEntry = true
        }
    }

    // Load delivery details
    LaunchedEffect(deliveryId) {
        loading = true
        val result = repo.getDeliveries()
        result.getOrNull()?.find { it.deliveryId == deliveryId }?.let { del ->
            delivery = del
            riderStatus = del.riderStatus
            // Initialize cash amount from delivery data
            if (cashAmount.isEmpty()) {
                cashAmount = del.amount?.toString() ?: "0.00"
            }
            android.util.Log.d("DeliveryDetail", "Loaded delivery: id=${del.deliveryId}, lat=${del.latitude}, lng=${del.longitude}, amount=${del.amount}")
        }
        loading = false
    }

    LaunchedEffect(riderStatus) {
        if (!riderStatus.contains("accepted", true)) {
            DeliveryCache.clearCapturedLocation(deliveryId)
        }
    }

    var navError by remember { mutableStateOf<String?>(null) }

    // Produce navigation coordinates (existing GPS or geocoded)
    val navCoords by produceState<Pair<Double, Double>?>(initialValue = null, key1 = delivery?.deliveryId) {
        val del = delivery
        if (del == null) {
            value = null
            return@produceState
        }

        if (del.latitude != null && del.longitude != null) {
            value = Pair(del.latitude!!, del.longitude!!)
            navError = null
            return@produceState
        }

        if (del.address.isBlank()) {
            navError = "No address provided"
            value = null
            return@produceState
        }

        geocoding = true
        navError = null
        val result = repo.geocodeAddress(del.address)
        value = result.getOrElse { err ->
            navError = err.message ?: "Unable to geocode address"
            null
        }
        geocoding = false
    }

    val usedGeocodedCoords = delivery?.let {
        (it.latitude == null || it.longitude == null) && navCoords != null
    } ?: false

    val statusColor = remember(riderStatus) {
        when {
            riderStatus.contains("delivered", true) || riderStatus.contains("completed", true) -> Color(0xFF34C759)
            riderStatus.contains("transit", true) -> Color(0xFF007AFF)
            riderStatus.contains("accepted", true) -> Color(0xFFFF9500)
            else -> Color(0xFF8E8E93)
        }
    }
    val statusIconVector = remember(riderStatus) {
        when {
            riderStatus.contains("delivered", true) || riderStatus.contains("completed", true) -> Icons.Outlined.CheckCircle
            riderStatus.contains("transit", true) -> Icons.Outlined.LocalShipping
            riderStatus.contains("accepted", true) -> Icons.Outlined.PendingActions
            else -> Icons.Outlined.LocationOn
        }
    }
    val currentStep = remember(riderStatus) {
        when {
            riderStatus.contains("delivered", true) || riderStatus.contains("completed", true) -> 3
            riderStatus.contains("transit", true) -> 2
            riderStatus.contains("accepted", true) -> 1
            else -> 0
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        delivery?.orderId ?: "Order Details",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
                    ) 
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                            contentDescription = "Back",
                            tint = MaterialTheme.colorScheme.onSurface
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(padding)
        ) {
            if (loading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            } else if (delivery == null) {
                Box(
                    modifier = Modifier
                        .fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("❌", fontSize = 48.sp)
                        Text("Order not found", style = MaterialTheme.typography.titleMedium)
                    }
                }
            } else {
                val currentDelivery = delivery!!
                Column(
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    val callCustomerAction = currentDelivery.customerPhone?.let { phone ->
                        {
                            val intent = Intent(Intent.ACTION_DIAL).apply {
                                data = Uri.parse("tel:$phone")
                            }
                            ctx.startActivity(intent)
                        }
                    }
                    InvoiceHeroCard(
                        orderId = currentDelivery.orderId,
                        riderStatus = riderStatus,
                        statusIcon = statusIconVector,
                        statusColor = statusColor,
                        currentStep = currentStep,
                        customerName = currentDelivery.customer,
                        customerPhone = currentDelivery.customerPhone,
                        onCallCustomer = callCustomerAction,
                        invoiceAmount = currentDelivery.amount
                    )

                    // Debug Info
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.1f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(Modifier.padding(8.dp)) {
                            Text("DEBUG INFO:", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelSmall)
                            Text("Lat: ${currentDelivery.latitude}", style = MaterialTheme.typography.bodySmall)
                            Text("Lng: ${currentDelivery.longitude}", style = MaterialTheme.typography.bodySmall)
                            Text("ID: ${currentDelivery.deliveryId}", style = MaterialTheme.typography.bodySmall)
                            
                            Button(
                                onClick = { 
                                    scope.launch {
                                        loading = true
                                        val result = repo.getDeliveries()
                                        result.getOrNull()?.find { it.deliveryId == deliveryId }?.let { del ->
                                            delivery = del
                                            riderStatus = del.riderStatus
                                            android.util.Log.d("DeliveryDetail", "Refreshed: lat=${del.latitude}")
                                        }
                                        loading = false
                                    }
                                },
                                modifier = Modifier.padding(top = 4.dp),
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                            ) {
                                Text("Force Refresh", fontSize = 10.sp)
                            }
                        }
                    }

                    // Delivery Address & Navigation Card - ALWAYS SHOW
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = Color(0xFFF8F9FA)
                    ),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.Top
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFF007AFF).copy(alpha = 0.15f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.Place,
                                    contentDescription = null,
                                    tint = Color(0xFF007AFF)
                                )
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    "Delivery Address",
                                    style = MaterialTheme.typography.titleMedium.copy(
                                        fontWeight = FontWeight.Bold
                                    )
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    delivery!!.address,
                                    style = MaterialTheme.typography.bodyMedium.copy(
                                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                                    )
                                )
                                
                                // Show coordinates if available
                                val finalLat = navCoords?.first
                                val finalLng = navCoords?.second
                                
                                if (finalLat != null && finalLng != null) {
                                    Spacer(Modifier.height(4.dp))
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            "$finalLat, $finalLng",
                                            style = MaterialTheme.typography.bodySmall.copy(
                                                color = Color(0xFF007AFF),
                                                fontWeight = FontWeight.Medium
                                            )
                                        )
                                        if (usedGeocodedCoords) {
                                            Icon(
                                                imageVector = Icons.Outlined.LocationOn,
                                                contentDescription = null,
                                                tint = Color(0xFF007AFF),
                                                modifier = Modifier.size(14.dp)
                                            )
                                        }
                                    }
                                } else if (geocoding) {
                                    Spacer(Modifier.height(4.dp))
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(12.dp),
                                            strokeWidth = 2.dp,
                                            color = Color(0xFF007AFF)
                                        )
                                        Text(
                                            "Getting coordinates...",
                                            style = MaterialTheme.typography.bodySmall.copy(
                                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                                            )
                                        )
                                    }
                                }
                            }
                        }
                        
                        // Navigation button - show if coordinates exist OR geocoded
                        val navLat = navCoords?.first
                        val navLng = navCoords?.second
                        
                        if (navLat != null && navLng != null) {
                            Button(
                                onClick = {
                                    val uri = Uri.parse("google.navigation:q=$navLat,$navLng")
                                    val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                                        setPackage("com.google.android.apps.maps")
                                    }
                                    try {
                                        ctx.startActivity(intent)
                                    } catch (e: Exception) {
                                        // Fallback to web maps
                                        val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse(
                                            "https://www.google.com/maps/dir/?api=1&destination=$navLat,$navLng"
                                        ))
                                        ctx.startActivity(webIntent)
                                    }
                                },
                                modifier = Modifier.fillMaxWidth().height(56.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color(0xFF007AFF)
                                )
                            ) {
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        imageVector = Icons.Outlined.Navigation,
                                        contentDescription = null,
                                        tint = Color.White
                                    )
                                    Column(horizontalAlignment = Alignment.Start) {
                                        Text("Navigate to Customer", 
                                            style = MaterialTheme.typography.titleMedium.copy(
                                                fontWeight = FontWeight.Bold
                                            )
                                        )
                                        if (usedGeocodedCoords) {
                                            Text("Via Shipping Address", 
                                                style = MaterialTheme.typography.bodySmall.copy(
                                                    color = Color.White.copy(alpha = 0.8f)
                                                )
                                            )
                                        }
                                    }
                                }
                            }
                        } else {
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                color = Color(0xFFFF9500).copy(alpha = 0.12f)
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        imageVector = Icons.Outlined.WarningAmber,
                                        contentDescription = null,
                                        tint = Color(0xFFFF9500)
                                    )
                                    Text(
                                        "No GPS coordinates available for navigation",
                                        style = MaterialTheme.typography.bodySmall.copy(
                                            color = Color(0xFFFF9500),
                                            fontWeight = FontWeight.Medium
                                        )
                                    )
                                }
                                navError?.let { error ->
                                    Spacer(Modifier.height(8.dp))
                                    Text(
                                        text = error,
                                        style = MaterialTheme.typography.bodySmall.copy(color = Color(0xFFFF3B30)),
                                        modifier = Modifier.fillMaxWidth()
                                    )
                                }
                            }
                        }
                    }
                }
                // Accept/Reject Actions (only for assigned orders)
                AnimatedVisibility(
                    visible = riderStatus.contains("assigned", true) && 
                              !riderStatus.contains("delivered", true) && 
                              !riderStatus.contains("completed", true),
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically()
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        FilledTonalButton(
                            onClick = {
                                scope.launch {
                                    val result = repo.rejectOrder(currentDelivery.orderId)
                                    result.fold(
                                        onSuccess = {
                                            onStatusChanged()
                                            snackbarHostState.showSnackbar("Order rejected")
                                            onBack()
                                        },
                                        onFailure = {
                                            snackbarHostState.showSnackbar(it.message ?: "Unable to reject order")
                                        }
                                    )
                                }
                            },
                            modifier = Modifier.weight(1f).height(56.dp),
                            shape = RoundedCornerShape(16.dp),
                            colors = ButtonDefaults.filledTonalButtonColors(
                                containerColor = Color(0xFFFF3B30).copy(alpha = 0.15f),
                                contentColor = Color(0xFFFF3B30)
                            )
                        ) {
                            Text("Reject", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold))
                        }
                        Button(
                            onClick = {
                                // Get current location and calculate estimate
                                scope.launch {
                                    calculatingEstimate = true
                                    estimatedDistance = "" // Reset distance
                                    try {
                                        // Check location permission first
                                        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                                            // Show dialog without auto-calculation
                                            calculatingEstimate = false
                                            showEstimateDialog = true
                                            snackbarHostState.showSnackbar("Location permission needed for accurate estimate")
                                            return@launch
                                        }
                                        
                                        // Get current location
                                        val fusedLocationClient = LocationServices.getFusedLocationProviderClient(ctx)
                                        val currentLoc = fusedLocationClient.lastLocation.await()
                                        
                                        if (currentLoc == null) {
                                            snackbarHostState.showSnackbar("Unable to get current location")
                                            estimatedMinutes = "30"
                                            calculatingEstimate = false
                                            showEstimateDialog = true
                                            return@launch
                                        }
                                        
                                        // Debug log
                                        android.util.Log.d("DeliveryDetail", "Checking coordinates: lat=${currentDelivery.latitude}, lng=${currentDelivery.longitude}")
                                        
                                        if (currentDelivery.latitude == null || currentDelivery.longitude == null) {
                                            snackbarHostState.showSnackbar("Delivery location not available")
                                            estimatedMinutes = "30"
                                            calculatingEstimate = false
                                            showEstimateDialog = true
                                            return@launch
                                        }
                                        
                                        // Calculate estimated time
                                        val result = repo.getEstimatedDeliveryTime(
                                            currentLoc.latitude,
                                            currentLoc.longitude,
                                            currentDelivery.latitude!!,
                                            currentDelivery.longitude!!
                                        )
                                        result.fold(
                                            onSuccess = { (minutes, distance) ->
                                                estimatedMinutes = minutes.toString()
                                                estimatedDistance = String.format("%.1f km", distance)
                                            },
                                            onFailure = { error ->
                                                // Use default if calculation fails
                                                estimatedMinutes = "30"
                                                estimatedDistance = ""
                                                snackbarHostState.showSnackbar("Could not calculate: ${error.message}")
                                            }
                                        )
                                    } catch (e: Exception) {
                                        // Use default on error
                                        estimatedMinutes = "30"
                                        estimatedDistance = ""
                                        snackbarHostState.showSnackbar("Error: ${e.message}")
                                    } finally {
                                        calculatingEstimate = false
                                        showEstimateDialog = true
                                    }
                                }
                            },
                            modifier = Modifier.weight(1f).height(56.dp),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            Text("Accept Order", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold))
                        }
                    }
                }
                
                // Location Section (for accepted and in_transit orders)
                AnimatedVisibility(
                    visible = (riderStatus.contains("accepted", true) || riderStatus.contains("transit", true)) && 
                              !riderStatus.contains("delivered", true) && 
                              !riderStatus.contains("completed", true),
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically()
                ) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(24.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(20.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .size(48.dp)
                                            .clip(CircleShape)
                                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = Icons.Outlined.LocationOn,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.primary
                                        )
                                    }
                                    Spacer(Modifier.width(12.dp))
                                    Column {
                                        Text(
                                            "Pickup Location",
                                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold)
                                        )
                                        Text(
                                            "Use GPS or enter coordinates",
                                            style = MaterialTheme.typography.bodySmall.copy(
                                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                                            )
                                        )
                                    }
                                }
                                Surface(
                                    shape = RoundedCornerShape(999.dp),
                                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)
                                ) {
                                    Text(
                                        text = if (location != null) "Ready" else "Pending",
                                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                                        style = MaterialTheme.typography.labelMedium.copy(
                                            fontWeight = FontWeight.SemiBold,
                                            color = MaterialTheme.colorScheme.primary
                                        )
                                    )
                                }
                            }

                            location?.let { (lat, lng) ->
                                Surface(
                                    shape = RoundedCornerShape(18.dp),
                                    color = Color(0xFF22C55E).copy(alpha = 0.12f)
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(16.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column {
                                            Text(
                                                "Location Captured",
                                                style = MaterialTheme.typography.bodyLarge.copy(
                                                    fontWeight = FontWeight.SemiBold,
                                                    color = Color(0xFF15803D)
                                                )
                                            )
                                            Text(
                                                "${String.format("%.6f", lat)}, ${String.format("%.6f", lng)}",
                                                style = MaterialTheme.typography.bodySmall.copy(color = Color(0xFF166534))
                                            )
                                        }
                                        Icon(
                                            imageVector = Icons.Outlined.CheckCircle,
                                            contentDescription = null,
                                            tint = Color(0xFF22C55E),
                                            modifier = Modifier.size(28.dp)
                                        )
                                    }
                                }
                            }

                            if (riderStatus.contains("accepted", true)) {
                                Button(
                                    onClick = {
                                        scope.launch {
                                            // Auto-capture current location before starting delivery
                                            val coords = try {
                                                locationLoading = true
                                                val fusedLocationClient = LocationServices.getFusedLocationProviderClient(ctx)
                                                val loc = fusedLocationClient.lastLocation.await()
                                                if (loc != null) {
                                                    val currentCoords = Pair(loc.latitude, loc.longitude)
                                                    persistLocation(currentCoords)
                                                    currentCoords
                                                } else {
                                                    snackbarHostState.showSnackbar("Unable to get current location")
                                                    locationLoading = false
                                                    return@launch
                                                }
                                            } catch (e: Exception) {
                                                snackbarHostState.showSnackbar("Location error: ${e.message}")
                                                locationLoading = false
                                                return@launch
                                            } finally {
                                                locationLoading = false
                                            }
                                            
                                            val result = repo.startDelivery(currentDelivery.orderId, coords)
                                            result.fold(
                                                onSuccess = {
                                                    riderStatus = "in_transit"
                                                    onStatusChanged()
                                                    
                                                    // Start background location tracking
                                                    LocationTrackingService.startTracking(ctx, deliveryId)
                                                    
                                                    snackbarHostState.showSnackbar("Delivery started - Location tracking active")
                                                },
                                                onFailure = {
                                                    snackbarHostState.showSnackbar(it.message ?: "Unable to start delivery")
                                                }
                                            )
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth().height(56.dp),
                                    shape = RoundedCornerShape(16.dp),
                                    enabled = !locationLoading
                                ) {
                                    if (locationLoading) {
                                        CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Color.White)
                                        Spacer(Modifier.width(8.dp))
                                        Text("Getting Location...", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold))
                                    } else {
                                        Icon(
                                            imageVector = Icons.Outlined.LocalShipping,
                                            contentDescription = null,
                                            tint = Color.White
                                        )
                                        Spacer(Modifier.width(8.dp))
                                        Text("Start Delivery", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold))
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Payment Section (only for in_transit)
                AnimatedVisibility(
                    visible = riderStatus.contains("transit", true) && 
                              !riderStatus.contains("delivered", true) && 
                              !riderStatus.contains("completed", true),
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically()
                ) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(24.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.12f))
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(20.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .size(48.dp)
                                            .clip(CircleShape)
                                            .background(Color(0xFF34C759).copy(alpha = 0.15f)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = Icons.Outlined.Payments,
                                            contentDescription = null,
                                            tint = Color(0xFF22C55E)
                                        )
                                    }
                                    Spacer(Modifier.width(12.dp))
                                    Column {
                                        Text("Payment", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
                                        Text(
                                            "Collect and validate customer payment",
                                            style = MaterialTheme.typography.bodySmall.copy(
                                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                                            )
                                        )
                                    }
                                }
                                Text(
                                    text = when (paymentMethod) {
                                        "cash" -> "₹ Cash"
                                        "upi" -> "UPI"
                                        "card" -> "Card"
                                        else -> "Pending"
                                    },
                                    style = MaterialTheme.typography.labelLarge.copy(
                                        color = Color(0xFF22C55E),
                                        fontWeight = FontWeight.Medium
                                    )
                                )
                            }

                            val paymentOptions = listOf(
                                Triple("cash", "Cash", Color(0xFFF97316)),
                                Triple("upi", "UPI", Color(0xFF0EA5E9)),
                                Triple("card", "Card", Color(0xFF6366F1))
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                paymentOptions.forEach { (key, label, tone) ->
                                    PaymentMethodChip(
                                        label = label,
                                        selected = paymentMethod == key,
                                        tint = tone,
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        paymentMethod = key
                                    }
                                }
                            }

                            when (paymentMethod) {
                                "cash" -> OutlinedTextField(
                                    value = cashAmount,
                                    onValueChange = { cashAmount = it },
                                    label = { Text("Amount (₹)") },
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(14.dp),
                                    colors = textFieldColors,
                                    supportingText = { Text("Default invoice amount") }
                                )
                                "upi" -> Column(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalArrangement = Arrangement.spacedBy(16.dp)
                                ) {
                                    // Show Generate QR button if no QR code yet
                                    if (qrCodeBitmap == null) {
                                        Button(
                                            onClick = {
                                                scope.launch {
                                                    qrGenerating = true
                                                    try {
                                                        val amount = cashAmount.toDoubleOrNull() ?: 0.0
                                                        val result = repo.generatePaymentQr(deliveryId = deliveryId, amount = amount)
                                                        result.getOrNull()?.let { response ->
                                                            val imageBytes = Base64.decode(response.qrCode, Base64.DEFAULT)
                                                            qrCodeBitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
                                                            paymentId = response.paymentId
                                                            upiString = response.upiString
                                                        } ?: run { snackbarHostState.showSnackbar("Failed to generate QR code") }
                                                    } catch (e: Exception) {
                                                        snackbarHostState.showSnackbar(e.message ?: "Error generating QR")
                                                    } finally {
                                                        qrGenerating = false
                                                    }
                                                }
                                            },
                                            modifier = Modifier.fillMaxWidth().height(56.dp),
                                            shape = RoundedCornerShape(14.dp),
                                            enabled = !qrGenerating
                                        ) {
                                            if (qrGenerating) {
                                                CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Color.White)
                                                Spacer(Modifier.width(12.dp))
                                                Text("Generating...")
                                            } else {
                                                Icon(Icons.Outlined.QrCode2, contentDescription = null)
                                                Spacer(Modifier.width(12.dp))
                                                Text("Generate Payment QR Code")
                                            }
                                        }
                                    }
                                    
                                    // Show QR code if generated
                                    qrCodeBitmap?.let { bitmap ->
                                        Card(
                                            modifier = Modifier.fillMaxWidth().aspectRatio(1f),
                                            shape = RoundedCornerShape(16.dp),
                                            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
                                        ) {
                                            Box(
                                                modifier = Modifier.fillMaxSize().background(Color.White).padding(16.dp),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Image(bitmap = bitmap.asImageBitmap(), contentDescription = "UPI QR Code", modifier = Modifier.fillMaxSize())
                                            }
                                        }
                                        Column(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalAlignment = Alignment.CenterHorizontally,
                                            verticalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Text(
                                                text = "₹${String.format("%.2f", cashAmount.toDoubleOrNull() ?: 0.0)}",
                                                style = MaterialTheme.typography.headlineMedium,
                                                fontWeight = FontWeight.Bold,
                                                color = MaterialTheme.colorScheme.primary
                                            )
                                            Text(
                                                text = "Ask customer to scan and pay",
                                                style = MaterialTheme.typography.bodyMedium,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                    
                                    // Transaction ID input field - always visible when UPI is selected
                                    OutlinedTextField(
                                        value = upiId,
                                        onValueChange = { upiId = it },
                                        label = { Text("Transaction ID / UPI Ref No.") },
                                        placeholder = { Text("Enter transaction number") },
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(14.dp),
                                        colors = textFieldColors,
                                        supportingText = { Text("Enter UPI transaction ID after payment") },
                                        singleLine = true
                                    )
                                    if (paymentCompleted) {
                                        Card(
                                            modifier = Modifier.fillMaxWidth(),
                                            shape = RoundedCornerShape(16.dp),
                                            colors = CardDefaults.cardColors(containerColor = Color(0xFF22C55E).copy(alpha = 0.1f)),
                                            border = BorderStroke(1.dp, Color(0xFF22C55E))
                                        ) {
                                            Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                                ) {
                                                    Icon(imageVector = Icons.Outlined.CheckCircle, contentDescription = null, tint = Color(0xFF22C55E), modifier = Modifier.size(32.dp))
                                                    Column {
                                                        Text(text = "Payment Successful", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color(0xFF22C55E))
                                                        Text(text = "Transaction completed", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                                                    }
                                                }
                                                HorizontalDivider(color = Color(0xFF22C55E).copy(alpha = 0.3f))
                                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                                        Text(text = "Amount:", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                                                        Text(text = "₹${String.format("%.2f", cashAmount.toDoubleOrNull() ?: 250.0)}", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                                                    }
                                                    transactionId?.let { txnId ->
                                                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                                            Text(text = "Transaction ID:", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                                                            Text(text = txnId, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                                                        }
                                                    }
                                                    paymentCompletedAt?.let { completedAt ->
                                                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                                            Text(text = "Completed At:", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                                                            Text(text = completedAt.substring(0, 19).replace("T", " "), style = MaterialTheme.typography.bodySmall)
                                                        }
                                                    }
                                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                                        Text(text = "Method:", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                                                        Text(text = "UPI", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                "card" -> OutlinedTextField(
                                    value = cardLast4,
                                    onValueChange = { cardLast4 = it },
                                    label = { Text("Last 4 Digits") },
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(14.dp),
                                    colors = textFieldColors,
                                    supportingText = { Text("Validate against the card receipt") }
                                )
                            }

                            OutlinedButton(
                                onClick = {
                                    if (hasCameraPermission) {
                                        cameraLauncher.launch(null)
                                    } else {
                                        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                                    }
                                },
                                modifier = Modifier.fillMaxWidth().height(48.dp),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.CameraAlt,
                                    contentDescription = null
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(if (capturedImage != null) "Photo Captured" else "Capture Photo")
                                if (capturedImage != null) {
                                    Spacer(Modifier.width(8.dp))
                                    Icon(
                                        imageVector = Icons.Outlined.CheckCircle,
                                        contentDescription = null,
                                        tint = Color(0xFF34C759)
                                    )
                                }
                            }

                            OutlinedButton(
                                onClick = { galleryLauncher.launch("image/*") },
                                modifier = Modifier.fillMaxWidth().height(48.dp),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.UploadFile,
                                    contentDescription = null
                                )
                                Spacer(Modifier.width(8.dp))
                                Text("Upload From Files")
                            }

                            capturedImage?.let { bitmap ->
                                Card(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .heightIn(min = 180.dp),
                                    shape = RoundedCornerShape(16.dp)
                                ) {
                                    Image(
                                        bitmap = bitmap.asImageBitmap(),
                                        contentDescription = "Proof attachment",
                                        modifier = Modifier.fillMaxWidth(),
                                        alignment = Alignment.Center
                                    )
                                }
                            }
                            
                            Button(
                                onClick = {
                                    scope.launch {
                                        // Capture current location before completing
                                        val coords = try {
                                            locationLoading = true
                                            val fusedLocationClient = LocationServices.getFusedLocationProviderClient(ctx)
                                            val loc = fusedLocationClient.lastLocation.await()
                                            if (loc != null) {
                                                val currentCoords = Pair(loc.latitude, loc.longitude)
                                                persistLocation(currentCoords)
                                                currentCoords
                                            } else {
                                                location ?: run {
                                                    snackbarHostState.showSnackbar("Unable to get current location. Please capture location manually.")
                                                    locationLoading = false
                                                    return@launch
                                                }
                                            }
                                        } catch (e: Exception) {
                                            location ?: run {
                                                snackbarHostState.showSnackbar("Location error: ${e.message}. Please capture location manually.")
                                                locationLoading = false
                                                return@launch
                                            }
                                        } finally {
                                            locationLoading = false
                                        }
                                        
                                        // Upload POD image first if captured
                                        capturedImage?.let { bitmap ->
                                            val stream = java.io.ByteArrayOutputStream()
                                            bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, stream)
                                            val imageBytes = stream.toByteArray()
                                            
                                            val uploadResult = repo.uploadPodImage(currentDelivery.orderId, imageBytes, "pod_${currentDelivery.orderId}.jpg")
                                            uploadResult.fold(
                                                onSuccess = { imageUrl ->
                                                    // Image uploaded successfully
                                                },
                                                onFailure = {
                                                    snackbarHostState.showSnackbar("Failed to upload POD image: ${it.message}")
                                                    return@launch
                                                }
                                            )
                                        }
                                        
                                        val paymentData = when (paymentMethod) {
                                            "cash" -> mapOf("method" to "cash", "cash_amount" to cashAmount.toDoubleOrNull())
                                            "upi" -> mapOf("method" to "upi", "upi_id" to upiId, "transaction_id" to upiId)
                                            "card" -> mapOf("method" to "card", "card_last4" to cardLast4)
                                            else -> mapOf("method" to "cash")
                                        }
                                        val result = repo.completeDelivery(currentDelivery.orderId, coords, paymentData)
                                        result.fold(
                                            onSuccess = {
                                                riderStatus = "delivered"
                                                onStatusChanged()
                                                
                                                // Stop background location tracking
                                                LocationTrackingService.stopTracking(ctx)
                                                
                                                snackbarHostState.showSnackbar("Order marked delivered")
                                                kotlinx.coroutines.delay(600)
                                                onBack()
                                            },
                                            onFailure = {
                                                snackbarHostState.showSnackbar(it.message ?: "Unable to complete delivery")
                                            }
                                        )
                                    }
                                },
                                enabled = !locationLoading &&
                                    (paymentMethod == "cash" && cashAmount.isNotEmpty() ||
                                     paymentMethod == "upi" && upiId.isNotEmpty() ||
                                     paymentMethod == "card" && cardLast4.isNotEmpty()),
                                modifier = Modifier.fillMaxWidth().height(56.dp),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.CheckCircle,
                                    contentDescription = null,
                                    tint = Color.White
                                )
                                Spacer(Modifier.width(8.dp))
                                Text("Complete Delivery", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold))
                            }
                        }
                    }
                }
                
                // Completed status message
                AnimatedVisibility(
                    visible = riderStatus.contains("delivered", true) || riderStatus.contains("completed", true),
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically()
                ) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = Color(0xFF34C759).copy(alpha = 0.12f)
                        )
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.CheckCircle,
                                contentDescription = null,
                                tint = Color(0xFF34C759),
                                modifier = Modifier.size(48.dp)
                            )
                            Text(
                                "Delivery Completed",
                                style = MaterialTheme.typography.titleLarge.copy(
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF34C759)
                                )
                            )
                            Text(
                                "This order has been successfully delivered",
                                style = MaterialTheme.typography.bodyMedium.copy(
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                                )
                            )
                        }
                    }
                }
            }
        }
        
        // Estimated Time Dialog - place inside the else block with delivery
        if (showEstimateDialog) {
            AlertDialog(
                onDismissRequest = { 
                    if (!calculatingEstimate) {
                        showEstimateDialog = false
                    }
                },
                title = { Text("Estimated Delivery Time") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        if (calculatingEstimate) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                CircularProgressIndicator(modifier = Modifier.size(24.dp))
                                Text(
                                    "Calculating based on your location...",
                                    style = MaterialTheme.typography.bodyMedium
                                )
                            }
                        } else {
                            if (estimatedDistance.isNotEmpty()) {
                                Surface(
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(8.dp),
                                    color = MaterialTheme.colorScheme.primaryContainer
                                ) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(
                                            imageVector = Icons.Outlined.Navigation,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                            modifier = Modifier.size(20.dp)
                                        )
                                        Text(
                                            "Distance: $estimatedDistance",
                                            style = MaterialTheme.typography.bodyMedium.copy(
                                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                                                fontWeight = FontWeight.Medium
                                            )
                                        )
                                    }
                                }
                            }
                            Text(
                                "How many minutes will it take to deliver?",
                                style = MaterialTheme.typography.bodyMedium
                            )
                            OutlinedTextField(
                                value = estimatedMinutes,
                                onValueChange = { estimatedMinutes = it.filter { c -> c.isDigit() } },
                                label = { Text("Minutes") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                                suffix = { Text("min") }
                            )
                        }
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            scope.launch {
                                val minutes = estimatedMinutes.toIntOrNull()
                                val result = repo.acceptOrder(delivery!!.orderId, minutes)
                                result.fold(
                                    onSuccess = {
                                        riderStatus = "accepted"
                                        onStatusChanged()
                                        snackbarHostState.showSnackbar("Order accepted")
                                        showEstimateDialog = false
                                    },
                                    onFailure = {
                                        snackbarHostState.showSnackbar(it.message ?: "Unable to accept order")
                                    }
                                )
                            }
                        },
                        enabled = !calculatingEstimate
                    ) {
                        Text("Accept")
                    }
                },
                dismissButton = {
                    TextButton(
                        onClick = { showEstimateDialog = false },
                        enabled = !calculatingEstimate
                    ) {
                        Text("Cancel")
                    }
                }
            )
        }
    } // End of Box wrapper
    } // End of Scaffold
} // End of DeliveryDetailScreen function


@Composable
private fun InvoiceHeroCard(
    orderId: String,
    riderStatus: String,
    statusIcon: ImageVector,
    statusColor: Color,
    currentStep: Int,
    customerName: String,
    customerPhone: String?,
    onCallCustomer: (() -> Unit)?,
    invoiceAmount: Double?
) {
    val normalizedStatus = riderStatus.replace("_", " ").replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF0B1220)),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Invoice Number and Status Badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = "Invoice",
                        style = MaterialTheme.typography.labelMedium.copy(color = Color.White.copy(alpha = 0.6f))
                    )
                    Text(
                        text = orderId,
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            fontSize = 20.sp
                        ),
                        maxLines = 2,
                        softWrap = true
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = statusColor.copy(alpha = 0.15f)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = statusIcon,
                            contentDescription = null,
                            tint = statusColor,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = normalizedStatus,
                            style = MaterialTheme.typography.labelMedium.copy(
                                color = statusColor,
                                fontWeight = FontWeight.SemiBold
                            )
                        )
                    }
                }
            }

            HorizontalDivider(color = Color.White.copy(alpha = 0.08f))

            // Invoice Amount (if available)
            invoiceAmount?.let { amount ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Invoice Amount",
                        style = MaterialTheme.typography.labelMedium.copy(
                            color = Color.White.copy(alpha = 0.6f)
                        )
                    )
                    Text(
                        text = "₹${String.format("%.2f", amount)}",
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF4ADE80)
                        )
                    )
                }
                HorizontalDivider(color = Color.White.copy(alpha = 0.08f))
            }

            // Delivery Progress
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = "Delivery Progress",
                    style = MaterialTheme.typography.titleSmall.copy(
                        color = Color.White.copy(alpha = 0.9f),
                        fontWeight = FontWeight.SemiBold
                    )
                )
                StatusTimeline(
                    currentStep = currentStep,
                    modifier = Modifier.padding(horizontal = 4.dp),
                    activeColor = Color(0xFF4F8EF7),
                    inactiveColor = Color.White.copy(alpha = 0.2f),
                    labelColor = Color.White.copy(alpha = 0.85f)
                )
            }

            HorizontalDivider(color = Color.White.copy(alpha = 0.08f))

            // Customer Details
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = "Customer Details",
                    style = MaterialTheme.typography.titleSmall.copy(
                        color = Color.White.copy(alpha = 0.9f),
                        fontWeight = FontWeight.SemiBold
                    )
                )
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = customerName,
                            style = MaterialTheme.typography.bodyLarge.copy(
                                color = Color.White,
                                fontWeight = FontWeight.Medium
                            )
                        )
                        if (customerPhone != null) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = customerPhone,
                                style = MaterialTheme.typography.bodyMedium.copy(
                                    color = Color.White.copy(alpha = 0.7f)
                                )
                            )
                        }
                    }
                }
                
                if (customerPhone != null && onCallCustomer != null) {
                    Button(
                        onClick = onCallCustomer,
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF10B981)
                        )
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Call,
                            contentDescription = null,
                            tint = Color.White
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "Call Customer",
                            style = MaterialTheme.typography.labelLarge.copy(
                                fontWeight = FontWeight.SemiBold,
                                color = Color.White
                            )
                        )
                    }
                }
            }
        }
    }
}


@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall.copy(
            color = Color.White.copy(alpha = 0.7f),
            fontWeight = FontWeight.SemiBold
        )
    )
}


@Composable
private fun InfoRow(label: String, value: String, highlight: Boolean = false) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium.copy(
                color = Color.White.copy(alpha = 0.6f)
            )
        )
        Text(
            text = value.ifBlank { "—" },
            style = MaterialTheme.typography.bodyMedium.copy(
                fontWeight = if (highlight) FontWeight.Bold else FontWeight.Medium,
                color = if (highlight) Color.White else Color.White.copy(alpha = 0.85f)
            )
        )
    }
}


@Composable
private fun PaymentMethodChip(
    label: String,
    selected: Boolean,
    tint: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
        color = if (selected) tint.copy(alpha = 0.15f) else Color.Transparent,
        border = BorderStroke(1.dp, if (selected) tint else Color.LightGray.copy(alpha = 0.4f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(tint)
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge.copy(
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                    color = if (selected) tint else MaterialTheme.colorScheme.onSurface
                )
            )
        }
    }
}


@Composable
private fun StatusTimeline(
    currentStep: Int,
    modifier: Modifier = Modifier,
    activeColor: Color = MaterialTheme.colorScheme.primary,
    inactiveColor: Color = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f),
    labelColor: Color = MaterialTheme.colorScheme.onSurface
) {
    val steps = listOf("Assigned", "Accepted", "In Transit", "Completed")
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        steps.forEachIndexed { index, label ->
            Column(
                modifier = Modifier.weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (index > 0) {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(3.dp)
                                .background(if (index - 1 < currentStep) activeColor else inactiveColor)
                        )
                    }
                    Box(
                        modifier = Modifier
                            .size(18.dp)
                            .clip(CircleShape)
                            .background(if (index <= currentStep) activeColor else inactiveColor.copy(alpha = 0.6f))
                    )
                    if (index < steps.lastIndex) {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(3.dp)
                                .background(if (index < currentStep) activeColor else inactiveColor)
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall.copy(color = labelColor),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}


