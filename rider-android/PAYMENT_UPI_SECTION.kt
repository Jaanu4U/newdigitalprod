// This is the replacement code for the UPI section in DeliveryDetailScreen.kt
// Replace lines 1036-1066 (the when(paymentMethod) block)

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
        if (!paymentCompleted && qrCodeBitmap == null) {
            // Generate QR Button
            Button(
                onClick = {
                    scope.launch {
                        qrGenerating = true
                        try {
                            val amount = cashAmount.toDoubleOrNull() ?: 250.0
                            val result = repo.generatePaymentQr(
                                deliveryId = deliveryId,
                                amount = amount
                            )
                            result.getOrNull()?.let { response ->
                                // Decode base64 to bitmap
                                val imageBytes = Base64.decode(response.qrCode, Base64.DEFAULT)
                                qrCodeBitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
                                paymentId = response.paymentId
                                upiString = response.upiString
                                paymentStatus = "pending"
                            } ?: run {
                                snackbarHostState.showSnackbar("Failed to generate QR code")
                            }
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
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = Color.White
                    )
                    Spacer(Modifier.width(12.dp))
                    Text("Generating...")
                } else {
                    Icon(Icons.Outlined.QrCode2, contentDescription = null)
                    Spacer(Modifier.width(12.dp))
                    Text("Generate Payment QR Code")
                }
            }
        }
        
        // QR Code Display
        qrCodeBitmap?.let { bitmap ->
            if (!paymentCompleted) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(1f),
                    shape = RoundedCornerShape(16.dp),
                    elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.White)
                            .padding(16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Image(
                            bitmap = bitmap.asImageBitmap(),
                            contentDescription = "UPI QR Code",
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                }
                
                // Amount and instructions
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "₹${String.format("%.2f", cashAmount.toDoubleOrNull() ?: 250.0)}",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Text(
                        text = "Ask customer to scan and pay",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    
                    // Status indicator
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp
                        )
                        Text(
                            text = "Waiting for payment...",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }
        }
        
        // Payment completed - show transaction details
        if (paymentCompleted) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = Color(0xFF22C55E).copy(alpha = 0.1f)
                ),
                border = BorderStroke(1.dp, Color(0xFF22C55E))
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            tint = Color(0xFF22C55E),
                            modifier = Modifier.size(32.dp)
                        )
                        Column {
                            Text(
                                text = "Payment Successful",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF22C55E)
                            )
                            Text(
                                text = "Transaction completed",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                            )
                        }
                    }
                    
                    HorizontalDivider(color = Color(0xFF22C55E).copy(alpha = 0.3f))
                    
                    // Transaction details
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "Amount:",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                            )
                            Text(
                                text = "₹${String.format("%.2f", cashAmount.toDoubleOrNull() ?: 250.0)}",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        
                        transactionId?.let { txnId ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "Transaction ID:",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                                )
                                Text(
                                    text = txnId,
                                    style = MaterialTheme.typography.bodySmall,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                        
                        paymentCompletedAt?.let { completedAt ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "Completed At:",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                                )
                                Text(
                                    text = completedAt.substring(0, 19).replace("T", " "),
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                        
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "Method:",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                            )
                            Text(
                                text = "UPI",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        } else if (!paymentCompleted && qrCodeBitmap == null) {
            // Manual UPI ID entry fallback
            OutlinedTextField(
                value = upiId,
                onValueChange = { upiId = it },
                label = { Text("Transaction / UTR ID (Manual)") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = textFieldColors,
                supportingText = { Text("Enter manually if QR not used") }
            )
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
