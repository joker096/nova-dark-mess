# Android/iOS End-to-End Verification Plan

Last updated: 2026-11-13

## Current State

### Android
- **Project generated:** `src-tauri/gen/android/` exists
- **APK/AAB built:** `app-release.apk` (4.3 MB), `app-release.aab` (4.2 MB) from Nov 11
- **Issues found:**
  - `MainActivity.kt` is an empty `AppCompatActivity`, NOT a Tauri Activity
  - `nova://` deep link intent-filter missing from merged AndroidManifest.xml
  - `build.gradle` lacks Tauri-specific dependencies
  - The current APK **cannot handle `nova://` deep links**

### iOS
- **Project NOT initialized** — requires macOS + Xcode for `tauri ios init`

## Required Steps

### 1. Reinitialize Android Project (Linux/Windows with Android SDK)

```bash
# Prerequisites:
# - Android SDK installed and ANDROID_HOME set
# - Java 17
# - Tauri CLI with Android support

# Remove existing generated Android project
rm -rf src-tauri/gen/android

# Regenerate
npx tauri android init
```

This will:
- Create proper Tauri Activity (not empty AppCompatActivity)
- Generate correct `build.gradle` with Tauri dependencies
- Set up deep link handler

### 2. Verify Deep Link Configuration

After `tauri android init`, verify:

```bash
# Check MainActivity.kt extends Tauri Activity
cat src-tauri/gen/android/app/src/main/java/com/messanger/e2e/MainActivity.kt

# Check AndroidManifest.xml has nova:// intent-filter
grep -A 5 "scheme.*nova" src-tauri/gen/android/app/src/main/AndroidManifest.xml

# If intent-filter missing, add manually:
```

Manual deep link intent-filter (if Tauri doesn't generate it):

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="nova" />
</intent-filter>
```

### 3. Build and Verify APK

```bash
# Build release APK
npx tauri android build

# Verify deep link handler in APK
unzip -p src-tauri/gen/android/app/build/outputs/apk/release/app-release.apk AndroidManifest.xml | grep -A 5 "nova"
```

### 4. Test on Device (Manual)

1. Install `app-release.apk` on Android device
2. Open browser on device
3. Navigate to `nova://chat/test123` (or use `adb shell am start -a android.intent.action.VIEW -d "nova://chat/test123"`)
4. Verify app opens with chat ID

### 5. Initialize iOS Project (macOS required)

```bash
# Prerequisites:
# - macOS with Xcode
# - Tauri CLI with iOS support

npx tauri ios init
```

### 6. Verify iOS Deep Link

```bash
# Check iOS project has nova:// URL scheme
grep -r "nova" src-tauri/ios/ --include="*.plist" --include="*.entitlements"
```

## Success Criteria

- [ ] Android APK opens when `nova://chat/<id>` is tapped
- [ ] Camera permission requested when QR scan is initiated
- [ ] Microphone permission requested when voice call is initiated
- [ ] iOS app opens when `nova://chat/<id>` is tapped (if iOS project exists)
- [ ] No PII collected during deep link handling
