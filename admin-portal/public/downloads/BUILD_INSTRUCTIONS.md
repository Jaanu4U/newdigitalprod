# Building the Rider Android App

The Android app is ready but needs to be built with proper Android development tools.

## Quick Option: Use the Web Portal
The rider web portal has all the same features as the Android app:
- **URL**: https://jugesh.digitalchain.in/rider/orders
- Works on any mobile browser
- No installation needed
- All features included

## Build the APK (For Developers)

### Option 1: Using Android Studio (Easiest)
1. Download Android Studio from https://developer.android.com/studio
2. Clone the project or copy `/root/digitalchain/rider-android`
3. Open the project in Android Studio
4. Wait for Gradle sync to complete
5. Build → Build Bundle(s) / APK(s) → Build APK(s)
6. APK will be in: `app/build/outputs/apk/debug/app-debug.apk`

### Option 2: Command Line with Gradle
```bash
cd /root/digitalchain/rider-android

# Install Java 17
sudo apt-get install openjdk-17-jdk

# Download Gradle wrapper
wget https://services.gradle.org/distributions/gradle-8.5-bin.zip
unzip gradle-8.5-bin.zip
sudo mv gradle-8.5 /opt/gradle
export PATH=/opt/gradle/bin:$PATH

# Create wrapper
gradle wrapper

# Build APK
./gradlew assembleDebug

# Copy to downloads
cp app/build/outputs/apk/debug/app-debug.apk /opt/digitalchain/admin-portal/public/downloads/rider-app.apk
```

### Option 3: Using Docker
```bash
cd /root/digitalchain/rider-android

# Use official Android build image
docker run --rm -v "$PWD":/project -w /project \
  mingc/android-build-box:latest \
  bash -c "./gradlew assembleDebug"

# Copy APK
cp app/build/outputs/apk/debug/app-debug.apk /opt/digitalchain/admin-portal/public/downloads/rider-app.apk
```

## After Building
Once built, the APK will be available for download at:
**https://jugesh.digitalchain.in/downloads/rider-app.apk**

## App Features
- ✓ Accept/Reject delivery orders
- ✓ GPS navigation integration  
- ✓ Photo proof of delivery
- ✓ Cash/UPI/Card payment collection
- ✓ Image compression (max 1920px, 80% quality)
- ✓ Offline mode support
- ✓ Manual location entry fallback
- ✓ Live location tracking

**App Version**: 0.1.0  
**Min Android**: 7.0 (API 24)  
**Target Android**: 14 (API 34)
