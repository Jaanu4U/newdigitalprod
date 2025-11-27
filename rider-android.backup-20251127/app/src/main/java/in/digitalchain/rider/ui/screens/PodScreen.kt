package in.digitalchain.rider.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import in.digitalchain.rider.data.Repository
import kotlinx.coroutines.launch

@Composable
fun PodScreen(deliveryId: String, onDone: () -> Unit) {
    val repo = remember { Repository() }
    val scope = rememberCoroutineScope()
    var recipient by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Proof of Delivery", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(value = recipient, onValueChange = { recipient = it }, label = { Text("Recipient Name") })
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text("Note (optional)") })
        Spacer(Modifier.height(12.dp))
        // TODO: capture signature/photo; placeholder button for now
        Button(onClick = {
            scope.launch {
                repo.uploadPod(deliveryId, recipient, note)
                onDone()
            }
        }) { Text("Submit PoD") }
    }
}
