# Digitalchain Rider Android App (Starter)

A minimal Android starter (Kotlin + Jetpack Compose) for the Rider app. It implements a basic flow: login → list deliveries → delivery details → update status → capture PoD (placeholder). Networking stubs are wired to the API contract outlined in `docs/rider-android-app.md`.

## Requirements
- Android Studio Giraffe+ (AGP 8.5+) and Android SDK
- JDK 17

## Configuration
- Base URL
  - `defaultConfig` → `https://api.digitalchain.in/v1/` (production)
  - `debug` → `http://10.0.2.2:9000/v1/` (Android emulator hitting host loopback)
  - `localDevice` → reads `LOCAL_API_HOST` / `LOCAL_API_PORT` env vars at build time so physical phones can target any dev server (falls back to `10.0.2.2:9000`).
  - For additional HTTP hosts, add them to `app/src/main/res/xml/network_security_config.xml`.
- Package name
  - Default: `in.digitalchain.rider` (change in `namespace` and `applicationId` in `app/build.gradle.kts`)
- Maps & FCM
  - Not required to build; integrate later with your project keys and `google-services.json`
- Signing & Play Integrity
  - Add your signing config and set up Play Integrity; we’ll bind the SHA‑256 later

## Build & Run
### From Android Studio
1. Open `rider-android/` in Android Studio
2. Choose the desired build variant (`debug`, `localDevice`, or `release`)
3. Sync Gradle and run the `app` configuration (API 24+)

### From the CLI
```bash
# Emulator build (talks to http://10.0.2.2:9000)
cd rider-android
./gradlew assembleDebug

# Physical device hitting a custom host/port
LOCAL_API_HOST=192.168.5.50 LOCAL_API_PORT=9000 ./gradlew assembleLocalDevice

# Release (HTTPS, prod base URL). Sign with your keystore afterward.
./gradlew assembleRelease
```
The generated APKs live in `app/build/outputs/apk/<variant>/`. Install with `adb install -r <apk-path>`.

## What’s implemented
- Compose navigation with four screens: Login, Deliveries, Delivery Detail, PoD (placeholder)
- Retrofit + Moshi client reading `BuildConfig.BASE_URL`
- Data models matching the Rider API endpoints

## Next steps
- Token storage (EncryptedSharedPreferences/DataStore) and auth headers
- Offline queue for status/PoD/location with WorkManager
- Runtime permissions for location and camera, PoD signature/photo capture
- FCM push handling and deep links
- Location updates (foreground service) and ETA polling (server-side)

See `../docs/rider-android-app.md` for full API and setup details.
