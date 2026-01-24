package com.digitalchain.rider.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.AllInbox
import androidx.compose.material.icons.outlined.AssignmentTurnedIn
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.Navigation
import androidx.compose.material.icons.outlined.PendingActions
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.*
import androidx.compose.material3.MenuAnchorType
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.digitalchain.rider.data.Repository
import com.digitalchain.rider.data.model.Delivery
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeliveriesScreen(
    onOpenDelivery: (String) -> Unit,
    onLogout: () -> Unit = {},
    refreshKey: Int = 0
) {
    val repo = remember { Repository() }
    val scope = rememberCoroutineScope()
    var deliveries by remember { mutableStateOf<List<Delivery>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var selectedTab by remember { mutableStateOf(DeliveryTab.ALL) }
    var showRefreshing by remember { mutableStateOf(false) }
    var showLogoutDialog by remember { mutableStateOf(false) }

    fun loadDeliveries() {
        scope.launch {
            loading = true
            deliveries = repo.getDeliveries().getOrElse { emptyList() }
            loading = false
        }
    }

    LaunchedEffect(refreshKey) {
        loadDeliveries()
    }

    val filteredDeliveries = remember(deliveries, selectedTab) {
        when (selectedTab) {
            DeliveryTab.ALL -> deliveries
            DeliveryTab.PENDING -> deliveries.filter { it.riderStatus.contains("assigned", true) }
            DeliveryTab.ACTIVE -> deliveries.filter { it.riderStatus.contains("accepted", true) }
            DeliveryTab.TRANSIT -> deliveries.filter { it.riderStatus.contains("transit", true) }
            DeliveryTab.DONE -> deliveries.filter { it.riderStatus.contains("delivered", true) || it.riderStatus.contains("completed", true) }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            "Deliveries",
                            style = MaterialTheme.typography.headlineSmall.copy(
                                fontWeight = FontWeight.Bold
                            )
                        )
                        Text(
                            "${deliveries.size} total orders",
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                            )
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = {
                            showRefreshing = true
                            scope.launch {
                                loadDeliveries()
                                kotlinx.coroutines.delay(500)
                                showRefreshing = false
                            }
                        }
                    ) {
                        if (showRefreshing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.primary
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Outlined.Refresh,
                                contentDescription = "Refresh",
                                tint = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                    IconButton(
                        onClick = { showLogoutDialog = true }
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Outlined.Logout,
                            contentDescription = "Logout",
                            tint = MaterialTheme.colorScheme.onSurface
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            if (loading && deliveries.isEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(48.dp),
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        "Loading deliveries...",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                }
            } else {
                Column(modifier = Modifier.fillMaxSize()) {
                    val pendingCount = deliveries.count { it.riderStatus.contains("assigned", true) }
                    val activeCount = deliveries.count { it.riderStatus.contains("accepted", true) }
                    val transitCount = deliveries.count { it.riderStatus.contains("transit", true) }
                    val completedCount = deliveries.count { it.riderStatus.contains("delivered", true) || it.riderStatus.contains("completed", true) }

                    val tabCounts = mapOf(
                        DeliveryTab.ALL to deliveries.size,
                        DeliveryTab.PENDING to pendingCount,
                        DeliveryTab.ACTIVE to activeCount,
                        DeliveryTab.TRANSIT to transitCount,
                        DeliveryTab.DONE to completedCount
                    )

                    DashboardHero(
                        total = deliveries.size,
                        pending = pendingCount,
                        active = activeCount,
                        transit = transitCount,
                        completed = completedCount
                    )

                    Spacer(Modifier.height(8.dp))

                    StatusFilterDropdown(
                        selectedTab = selectedTab,
                        counts = tabCounts,
                        onSelect = { selectedTab = it }
                    )

                    if (filteredDeliveries.isEmpty()) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(32.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Text(
                                when (selectedTab) {
                                    DeliveryTab.PENDING -> "📭"
                                    DeliveryTab.ACTIVE -> "🚦"
                                    DeliveryTab.TRANSIT -> "🚚"
                                    DeliveryTab.DONE -> "✨"
                                    DeliveryTab.ALL -> "📦"
                                },
                                fontSize = 64.sp
                            )
                            Spacer(Modifier.height(16.dp))
                            Text(
                                when (selectedTab) {
                                    DeliveryTab.PENDING -> "No pending deliveries"
                                    DeliveryTab.ACTIVE -> "No active deliveries"
                                    DeliveryTab.TRANSIT -> "No in-transit deliveries"
                                    DeliveryTab.DONE -> "No completed deliveries"
                                    DeliveryTab.ALL -> "No deliveries found"
                                },
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                "Check back later for new orders",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                            )
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            items(filteredDeliveries, key = { it.deliveryId }) { delivery ->
                                ModernDeliveryCard(
                                    delivery = delivery,
                                    onClick = { onOpenDelivery(delivery.deliveryId) }
                                )
                            }
                            
                            item {
                                Spacer(Modifier.height(8.dp))
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Logout confirmation dialog
    if (showLogoutDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            title = { Text("Logout") },
            text = { Text("Are you sure you want to logout?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showLogoutDialog = false
                        onLogout()
                    }
                ) {
                    Text("Logout", color = Color(0xFFDC3545))
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
private fun ModernDeliveryCard(
    delivery: Delivery,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    val statusColor = remember(delivery.riderStatus) {
        when {
            delivery.riderStatus.contains("delivered", true) || delivery.riderStatus.contains("completed", true) -> Color(0xFF10B981)
            delivery.riderStatus.contains("transit", true) -> Color(0xFF3B82F6)
            delivery.riderStatus.contains("accepted", true) -> Color(0xFFF59E0B)
            else -> Color(0xFF6B7280)
        }
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color.White
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            // Invoice Number with Route Sequence and Status
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    // Route sequence badge (if optimized)
                    delivery.routeSequence?.let { sequence ->
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFF10B981)
                        ) {
                            Text(
                                sequence.toString(),
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                style = MaterialTheme.typography.labelMedium.copy(
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White
                                )
                            )
                        }
                    }
                    
                    Text(
                        delivery.orderId,
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF1F2937)
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = statusColor.copy(alpha = 0.1f)
                ) {
                    Text(
                        when {
                            delivery.riderStatus.contains("delivered", true) || delivery.riderStatus.contains("completed", true) -> "Delivered"
                            delivery.riderStatus.contains("transit", true) -> "In Transit"
                            delivery.riderStatus.contains("accepted", true) -> "Accepted"
                            else -> "Assigned"
                        },
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.SemiBold,
                            color = statusColor
                        )
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            // Customer Name with Phone
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFEFF6FF)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            delivery.customer.firstOrNull()?.uppercase() ?: "?",
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF3B82F6)
                            )
                        )
                    }
                    Column {
                        Text(
                            delivery.customer,
                            style = MaterialTheme.typography.bodyLarge.copy(
                                fontWeight = FontWeight.Medium,
                                color = Color(0xFF374151)
                            )
                        )
                        delivery.customerPhone?.let { phone ->
                            Text(
                                phone,
                                style = MaterialTheme.typography.bodySmall.copy(
                                    color = Color(0xFF6B7280)
                                )
                            )
                        }
                    }
                }
                
                // Call button
                delivery.customerPhone?.let { phone ->
                    IconButton(
                        onClick = {
                            val intent = Intent(Intent.ACTION_DIAL).apply {
                                data = Uri.parse("tel:$phone")
                            }
                            context.startActivity(intent)
                        },
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF10B981).copy(alpha = 0.1f))
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Call,
                            contentDescription = "Call customer",
                            tint = Color(0xFF10B981),
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))

            // Address
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.Top
            ) {
                Icon(
                    imageVector = Icons.Outlined.Place,
                    contentDescription = "Address",
                    tint = Color(0xFF6B7280),
                    modifier = Modifier.size(18.dp).padding(top = 2.dp)
                )
                Text(
                    delivery.address,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = Color(0xFF6B7280),
                        lineHeight = 20.sp
                    ),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun DashboardHero(
    total: Int,
    pending: Int,
    active: Int,
    transit: Int,
    completed: Int
) {
    val completionRatio = remember(total, completed) {
        if (total <= 0) 0f else completed.toFloat() / total
    }

    val missionSubtitle = remember(pending, active, transit, completed, total) {
        when {
            total == 0 -> "Awaiting new assignments"
            completed == total -> "Everything wrapped for today"
            transit > 0 -> "${transit} riders on the road"
            active > 0 -> "${active} accepted • Prep to roll"
            pending > 0 -> "${pending} ready for pickup"
            else -> "Stay tuned for updates"
        }
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent)
    ) {
        Box(
            modifier = Modifier
                .background(
                    Brush.linearGradient(
                        listOf(Color(0xFF0F2027), Color(0xFF203A43), Color(0xFF2C5364))
                    )
                )
                .padding(20.dp)
        ) {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    "Today's Mission",
                    color = Color.White.copy(alpha = 0.75f),
                    style = MaterialTheme.typography.labelLarge
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    "$total Deliveries",
                    style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                    color = Color.White
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    missionSubtitle,
                    color = Color.White.copy(alpha = 0.85f),
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(Modifier.height(16.dp))
                LinearProgressIndicator(
                    progress = { completionRatio },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(RoundedCornerShape(50)),
                    trackColor = Color.White.copy(alpha = 0.2f),
                    color = Color(0xFF4ADE80)
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StatusFilterDropdown(
    selectedTab: DeliveryTab,
    counts: Map<DeliveryTab, Int>,
    onSelect: (DeliveryTab) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedCount = counts[selectedTab] ?: 0

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded },
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
    ) {
        TextField(
            value = "${selectedTab.label} • $selectedCount",
            onValueChange = {},
            readOnly = true,
            leadingIcon = {
                Icon(
                    imageVector = selectedTab.icon,
                    contentDescription = null,
                    tint = selectedTab.tint
                )
            },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                .fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            colors = ExposedDropdownMenuDefaults.textFieldColors(
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
                disabledIndicatorColor = Color.Transparent
            ),
            textStyle = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
            supportingText = {
                Text(
                    text = "Tap to change status filter",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
            }
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            DeliveryTab.values().forEach { tab ->
                DropdownMenuItem(
                    text = {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Icon(
                                    imageVector = tab.icon,
                                    contentDescription = null,
                                    tint = tab.tint,
                                    modifier = Modifier.size(20.dp)
                                )
                                Text(
                                    tab.label,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }
                            Surface(
                                shape = RoundedCornerShape(999.dp),
                                color = tab.tint.copy(alpha = 0.15f)
                            ) {
                                Text(
                                    text = (counts[tab] ?: 0).toString(),
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 2.dp),
                                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                                    color = tab.tint
                                )
                            }
                        }
                    },
                    onClick = {
                        onSelect(tab)
                        expanded = false
                    }
                )
            }
        }
    }
}

private enum class DeliveryTab(
    val label: String,
    val icon: ImageVector,
    val tint: Color
) {
    ALL("All", Icons.Outlined.AllInbox, Color(0xFF475569)),
    PENDING("Pending", Icons.Outlined.PendingActions, Color(0xFFFF8A00)),
    ACTIVE("Active", Icons.Outlined.AssignmentTurnedIn, Color(0xFF6366F1)),
    TRANSIT("Transit", Icons.Outlined.LocalShipping, Color(0xFF0EA5E9)),
    DONE("Done", Icons.Outlined.CheckCircle, Color(0xFF22C55E))
}
