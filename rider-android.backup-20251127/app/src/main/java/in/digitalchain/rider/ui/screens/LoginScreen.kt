package in.digitalchain.rider.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import in.digitalchain.rider.data.Repository

@Composable
fun LoginScreen(onLoggedIn: () -> Unit) {
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var orgId by remember { mutableStateOf("") }
    var deviceId by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(text = "Rider Login", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Email") }, singleLine = true)
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = password, onValueChange = { password = it }, label = { Text("Password") }, visualTransformation = PasswordVisualTransformation(), singleLine = true)
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = orgId, onValueChange = { orgId = it }, label = { Text("Org ID") }, singleLine = true)
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = deviceId, onValueChange = { deviceId = it }, label = { Text("Device ID") }, singleLine = true)
        Spacer(Modifier.height(16.dp))

        if (error != null) Text(text = error!!, color = MaterialTheme.colorScheme.error)

        Button(enabled = !loading, onClick = {
            loading = true
            error = null
            scope.launch {
                val repo = Repository()
                val result = repo.login(email, password, orgId, deviceId)
                loading = false
                if (result.isSuccess) onLoggedIn() else error = result.exceptionOrNull()?.message ?: "Login failed"
            }
        }) {
            Text(if (loading) "Signing in..." else "Sign In")
        }
    }
}
