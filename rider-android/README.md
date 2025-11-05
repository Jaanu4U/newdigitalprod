# Digitalchain Rider Android App (Starter)

A minimal Android starter (Kotlin + Jetpack Compose) for the Rider app. It implements a basic flow: login → list deliveries → delivery details → update status → capture PoD (placeholder). Networking stubs are wired to the API contract outlined in `docs/rider-android-app.md`.

## Requirements
- Android Studio Giraffe+ (AGP 8.5+) and Android SDK
- JDK 17

## Configuration
- Base URL
  - Set in `app/build.gradle.kts` BuildConfig: `BASE_URL` (default: staging `https://staging.api.digitalchain.in/v1/`)
- Package name
  - Default: `in.digitalchain.rider` (change in `namespace` and `applicationId` in `app/build.gradle.kts`)
- Maps & FCM
  - Not required to build; integrate later with your project keys and `google-services.json`
- Signing & Play Integrity
  - Add your signing config and set up Play Integrity; we’ll bind the SHA‑256 later

## Run
1. Open `rider-android/` in Android Studio
2. Sync Gradle and run the `app` configuration on an emulator/device (API 24+)

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
