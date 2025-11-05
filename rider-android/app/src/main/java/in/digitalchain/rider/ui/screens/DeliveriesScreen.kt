package in.digitalchain.rider.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import in.digitalchain.rider.data.Repository
import in.digitalchain.rider.data.model.Delivery
import kotlinx.coroutines.launch

@Composable
fun DeliveriesScreen(onOpenDelivery: (String) -> Unit) {
    val repo = remember { Repository() }
    val scope = rememberCoroutineScope()
    var deliveries by remember { mutableStateOf<List<Delivery>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        scope.launch {
            deliveries = repo.getDeliveries().getOrElse { emptyList() }
            loading = false
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Today's Deliveries", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        if (loading) {
            LinearProgressIndicator(Modifier.fillMaxWidth())
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(deliveries) { d ->
                    Card(modifier = Modifier.fillMaxWidth().clickable { onOpenDelivery(d.deliveryId) }) {
                        Column(Modifier.padding(16.dp)) {
                            Text("#${d.orderId} - ${d.customer}", style = MaterialTheme.typography.titleMedium)
                            Text(d.address, style = MaterialTheme.typography.bodyMedium)
                            Text("Status: ${d.status}", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}
