package in.digitalchain.rider.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import in.digitalchain.rider.data.Repository
import kotlinx.coroutines.launch

@Composable
fun DeliveryDetailScreen(deliveryId: String, onCapturePod: () -> Unit) {
    val ctx = LocalContext.current
    val repo = remember { Repository() }
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf("out_for_delivery") }
    var note by remember { mutableStateOf("") }
    var lat by remember { mutableStateOf(0.0) }
    var lng by remember { mutableStateOf(0.0) }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Delivery $deliveryId", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                // Deep link to Google Maps navigation
                val uri = Uri.parse("google.navigation:q=$lat,$lng&mode=d")
                val intent = Intent(Intent.ACTION_VIEW, uri)
                intent.setPackage("com.google.android.apps.maps")
                ctx.startActivity(intent)
            }) { Text("Navigate") }
            Button(onClick = onCapturePod) { Text("Capture PoD") }
        }
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(value = status, onValueChange = { status = it }, label = { Text("Status") })
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text("Note") })
        Spacer(Modifier.height(8.dp))
        Button(onClick = {
            scope.launch {
                repo.updateStatus(deliveryId, status, note)
            }
        }) { Text("Update Status") }
    }
}
