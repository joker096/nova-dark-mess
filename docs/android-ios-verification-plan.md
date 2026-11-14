# Android/iOS End-to-End Verification Plan

Last updated: 2026-11-14

## Current State

### Android
- **Project generated:** `src-tauri/gen/android/` exists and is tracked.
- **Activity:** `MainActivity.kt` extends `TauriActivity()`.
- **Deep link:** `nova://` is declared in `tauri.conf.json` (`plugins.deep-link.mobile`) and present in the merged manifest.
- **Permissions:** `AndroidManifest.xml` declares `CAMERA`, `RECORD_AUDIO`, and optional `camera` / `microphone` features.
- **Runtime permission handler:** `src-tauri/src/lib.rs` answers Tauri permission requests for Camera and Microphone with `Allow`.
- **Verified locally (2026-11-14):** a debug APK installed on an x86_64 emulator, `am start -a android.intent.action.VIEW -d "nova://chat/ci-smoke-test"` resumed `com.messanger.e2e.debug` with the link intact, and `pm grant` succeeded for both permissions.
- **Not yet verified on CI:** the WebView `getUserMedia` probe still needs a green run of `.github/workflows/android-e2e.yml` on GitHub-hosted infrastructure. The local API 37 (16 KB page size) image crashes `surfaceflinger` and system services, so it is not a reliable target.

### iOS
- **Project NOT initialized** — requires macOS + Xcode for `tauri ios init`.

## Automated Android Check

`.github/workflows/android-e2e.yml` runs on `workflow_dispatch` and on pull requests touching the Android shell, deep links, media calls, or the workflow itself.

It:
1. Installs Android SDK 37, build-tools 37.0.0, NDK 27.0.12077973, and all four Android Rust targets.
2. Builds a debug APK with `npx tauri android build --apk --debug --target x86_64`.
3. Starts an API 35 `google_apis` x86_64 emulator with a virtual back camera and audio enabled.
4. Runs `node scripts/android-e2e.mjs`, which:
   - installs the APK and opens `nova://chat/ci-smoke-test`;
   - asserts the app is the resumed activity and the intent kept the deep link;
   - asserts `CAMERA` and `RECORD_AUDIO` are declared and grants them;
   - attaches to the WebView through `adb forward` + Chrome DevTools Protocol and calls `navigator.mediaDevices.getUserMedia({ video: true })` and `({ audio: true })`, failing unless both streams open;
   - fails if logcat contains a `FATAL EXCEPTION`, native crash or ANR for the app package, or if the app process restarted during the check.

Run it locally against a booted emulator/device:

```bash
ANDROID_APK=src-tauri/gen/android/app/build/outputs/apk/x86_64/debug/app-x86_64-debug.apk \
  node scripts/android-e2e.mjs
```

Useful environment overrides: `ADB`, `ANDROID_PACKAGE`, `ANDROID_DEEP_LINK`, `SKIP_INSTALL=1`.

## Manual Android Check (optional)

1. Install the debug APK.
2. Run `adb shell am start -W -a android.intent.action.VIEW -d "nova://chat/test123"`.
3. Confirm the app opens the chat.
4. Open the QR scanner and start a voice call; both should acquire media without a system denial.

## iOS

iOS still requires macOS + Xcode:

```bash
npx tauri ios init
grep -r "nova" src-tauri/ios/ --include="*.plist" --include="*.entitlements"
```

## Success Criteria

- [x] Android APK opens when `nova://chat/<id>` is dispatched (verified on a local emulator).
- [ ] Camera permission and stream work inside the Android WebView (automated in `android-e2e.yml`; pending a green CI run).
- [ ] Microphone permission and stream work inside the Android WebView (automated in `android-e2e.yml`; pending a green CI run).
- [ ] iOS app opens when `nova://chat/<id>` is tapped (iOS project does not exist yet).
- [x] No PII collected during deep link handling.
