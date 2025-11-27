package in.digitalchain.rider

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import in.digitalchain.rider.ui.screens.DeliveryDetailScreen
import in.digitalchain.rider.ui.screens.DeliveriesScreen
import in.digitalchain.rider.ui.screens.LoginScreen
import in.digitalchain.rider.ui.screens.PodScreen
import in.digitalchain.rider.ui.theme.RiderTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            RiderTheme {
                Surface(color = MaterialTheme.colorScheme.background) {
                    AppNavigator()
                }
            }
        }
    }
}

@Composable
fun AppNavigator() {
    val navController: NavHostController = rememberNavController()
    NavHost(navController = navController, startDestination = "login") {
        composable("login") {
            LoginScreen(onLoggedIn = { navController.navigate("deliveries") { popUpTo("login") { inclusive = true } } })
        }
        composable("deliveries") {
            DeliveriesScreen(
                onOpenDelivery = { id -> navController.navigate("delivery/$id") }
            )
        }
        composable("delivery/{id}") {
            val id = it.arguments?.getString("id") ?: ""
            DeliveryDetailScreen(
                deliveryId = id,
                onCapturePod = { navController.navigate("pod/$id") }
            )
        }
        composable("pod/{id}") {
            val id = it.arguments?.getString("id") ?: ""
            PodScreen(deliveryId = id, onDone = { navController.popBackStack("deliveries", false) })
        }
    }
}

@Preview
@Composable
fun AppPreview() {
    RiderTheme {
        AppNavigator()
    }
}
