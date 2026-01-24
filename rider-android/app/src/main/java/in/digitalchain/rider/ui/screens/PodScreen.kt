package com.digitalchain.rider.ui.screens

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Color
import android.graphics.Paint as AndroidPaint
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Draw
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.digitalchain.rider.data.OfflineQueueException
import com.digitalchain.rider.data.Repository
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException

@Composable
fun PodScreen(deliveryId: String, onDone: () -> Unit) {
    val repo = remember { Repository() }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    var recipient by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var selectedTab by remember { mutableIntStateOf(0) }
    var isSubmitting by remember { mutableStateOf(false) }

    val signaturePaths = remember { mutableStateListOf<List<Offset>>() }
    var inProgressPath by remember { mutableStateOf<List<Offset>>(emptyList()) }
    var signatureSize by remember { mutableStateOf(IntSize.Zero) }
    val hasSignature by remember { derivedStateOf { signaturePaths.isNotEmpty() || inProgressPath.size > 1 } }

    var capturedBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var photoFile by remember { mutableStateOf<File?>(null) }

    val takePictureLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        if (success) {
            photoFile?.let { file ->
                capturedBitmap = BitmapFactory.decodeFile(file.absolutePath)
            }
        } else {
            photoFile?.delete()
            photoFile = null
            capturedBitmap = null
        }
    }

    fun launchCamera() {
        val cacheDir = context.cacheDir
        val newFile = try {
            File.createTempFile("pod_photo_${deliveryId}_", ".jpg", cacheDir)
        } catch (io: IOException) {
            scope.launch {
                snackbarHostState.showSnackbar(io.message ?: "Unable to access camera storage")
            }
            return
        }

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            newFile
        )

        photoFile?.delete()
        photoFile = newFile
        takePictureLauncher.launch(uri)
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Proof of Delivery",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold
            )

            OutlinedTextField(
                value = recipient,
                onValueChange = { recipient = it },
                label = { Text("Recipient Name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = note,
                onValueChange = { note = it },
                label = { Text("Note (optional)") },
                modifier = Modifier.fillMaxWidth()
            )

            val tabs = listOf("Signature", "Photo")
            TabRow(selectedTabIndex = selectedTab) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(title) },
                        icon = {
                            if (index == 0) {
                                Icon(imageVector = Icons.Outlined.Draw, contentDescription = null)
                            } else {
                                Icon(imageVector = Icons.Outlined.PhotoCamera, contentDescription = null)
                            }
                        }
                    )
                }
            }

            when (selectedTab) {
                0 -> {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Capture signature",
                                style = MaterialTheme.typography.titleMedium
                            )
                            TextButton(onClick = {
                                signaturePaths.clear()
                                inProgressPath = emptyList()
                            }) {
                                Text("Clear")
                            }
                        }

                        val surfaceVariant = MaterialTheme.colorScheme.surfaceVariant
                        val outlineColor = MaterialTheme.colorScheme.outline
                        val strokeColor = MaterialTheme.colorScheme.onSurface

                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(220.dp)
                        ) {
                            Canvas(
                                modifier = Modifier
                                    .matchParentSize()
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(surfaceVariant)
                                    .border(1.dp, outlineColor, RoundedCornerShape(16.dp))
                                    .pointerInput(Unit) {
                                        detectDragGestures(
                                            onDragStart = { offset ->
                                                inProgressPath = listOf(offset)
                                            },
                                            onDrag = { change, _ ->
                                                inProgressPath = inProgressPath + change.position
                                            },
                                            onDragEnd = {
                                                if (inProgressPath.size > 1) {
                                                    signaturePaths.add(inProgressPath)
                                                }
                                                inProgressPath = emptyList()
                                            },
                                            onDragCancel = {
                                                inProgressPath = emptyList()
                                            }
                                        )
                                    }
                                    .onSizeChanged { signatureSize = it }
                            ) {
                                fun drawStroke(points: List<Offset>) {
                                    if (points.size < 2) return
                                    for (i in 0 until points.lastIndex) {
                                        drawLine(
                                            color = strokeColor,
                                            start = points[i],
                                            end = points[i + 1],
                                            strokeWidth = 6f,
                                            cap = StrokeCap.Round
                                        )
                                    }
                                }

                                signaturePaths.forEach { drawStroke(it) }
                                drawStroke(inProgressPath)
                            }

                            if (!hasSignature) {
                                Text(
                                    text = "Sign inside the box",
                                    modifier = Modifier
                                        .align(Alignment.Center)
                                        .padding(12.dp),
                                    textAlign = TextAlign.Center,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }

                else -> {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(
                            text = "Capture proof photo",
                            style = MaterialTheme.typography.titleMedium
                        )

                        Button(onClick = { launchCamera() }, enabled = !isSubmitting) {
                            Icon(imageVector = Icons.Outlined.PhotoCamera, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Open Camera")
                        }

                        capturedBitmap?.let { bitmap ->
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(220.dp)
                                    .clip(RoundedCornerShape(16.dp))
                                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(16.dp))
                            ) {
                                Image(
                                    bitmap = bitmap.asImageBitmap(),
                                    contentDescription = "Captured proof",
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.fillMaxSize()
                                )
                            }

                            TextButton(onClick = {
                                photoFile?.delete()
                                photoFile = null
                                capturedBitmap = null
                            }) {
                                Text("Remove photo")
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.weight(1f, fill = true))

            Button(
                onClick = {
                    scope.launch {
                        if (recipient.isBlank()) {
                            snackbarHostState.showSnackbar("Recipient name is required")
                            return@launch
                        }

                        if (selectedTab == 0 && !hasSignature) {
                            snackbarHostState.showSnackbar("Please capture a signature")
                            return@launch
                        }

                        if (selectedTab == 1 && capturedBitmap == null) {
                            snackbarHostState.showSnackbar("Please capture a delivery photo")
                            return@launch
                        }

                        isSubmitting = true

                        if (inProgressPath.size > 1) {
                            signaturePaths.add(inProgressPath)
                            inProgressPath = emptyList()
                        }

                        val imageBytes: ByteArray? = when (selectedTab) {
                            0 -> {
                                val bitmap = buildSignatureBitmap(signaturePaths.toList(), signatureSize)
                                if (bitmap == null) {
                                    snackbarHostState.showSnackbar("Unable to capture signature")
                                    isSubmitting = false
                                    return@launch
                                }
                                val stream = ByteArrayOutputStream()
                                bitmap.compress(Bitmap.CompressFormat.JPEG, 90, stream)
                                stream.toByteArray()
                            }

                            else -> {
                                val file = photoFile
                                if (file == null || !file.exists()) {
                                    snackbarHostState.showSnackbar("Captured photo is missing")
                                    isSubmitting = false
                                    return@launch
                                }
                                file.readBytes()
                            }
                        }

                        val imageFileName = when (selectedTab) {
                            0 -> "pod_signature_${deliveryId}.jpg"
                            else -> photoFile?.name ?: "pod_photo_${deliveryId}.jpg"
                        }

                        val imageResult = imageBytes?.let {
                            repo.uploadPodImage(deliveryId, it, imageFileName)
                        }

                        val imageError = imageResult?.exceptionOrNull()
                        val imageQueued = imageError is OfflineQueueException
                        if (imageError != null && !imageQueued) {
                            snackbarHostState.showSnackbar(imageError.message ?: "Failed to upload proof image")
                            isSubmitting = false
                            return@launch
                        }

                        if (selectedTab == 1) {
                            photoFile?.delete()
                            photoFile = null
                            capturedBitmap = null
                        }

                        val podResult = repo.uploadPod(
                            id = deliveryId,
                            recipientName = recipient.trim(),
                            note = note.ifBlank { null }
                        )

                        val podError = podResult.exceptionOrNull()
                        val podQueued = podError is OfflineQueueException
                        if (podError != null && !podQueued) {
                            snackbarHostState.showSnackbar(podError.message ?: "Failed to submit proof of delivery")
                            isSubmitting = false
                            return@launch
                        }

                        val queued = (imageQueued || podQueued)
                        val message = if (queued) {
                            "Submission saved offline. It will sync automatically."
                        } else {
                            "Proof of delivery submitted."
                        }

                        snackbarHostState.showSnackbar(message)
                        isSubmitting = false
                        onDone()
                    }
                },
                enabled = !isSubmitting,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
            ) {
                if (isSubmitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                    Spacer(Modifier.width(12.dp))
                }
                Text("Submit PoD")
            }
        }
    }
}

private fun buildSignatureBitmap(
    strokes: List<List<Offset>>,
    canvasSize: IntSize
): Bitmap? {
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return null
    if (strokes.isEmpty()) return null

    val bitmap = Bitmap.createBitmap(canvasSize.width, canvasSize.height, Bitmap.Config.ARGB_8888)
    val canvas = AndroidCanvas(bitmap)
    canvas.drawColor(Color.WHITE)
    val paint = AndroidPaint().apply {
        color = Color.BLACK
        style = AndroidPaint.Style.STROKE
        strokeWidth = 8f
        strokeCap = AndroidPaint.Cap.ROUND
        isAntiAlias = true
    }

    strokes.forEach { line ->
        if (line.size > 1) {
            for (i in 0 until line.lastIndex) {
                val start = line[i]
                val end = line[i + 1]
                canvas.drawLine(start.x, start.y, end.x, end.y, paint)
            }
        }
    }

    return bitmap
}
