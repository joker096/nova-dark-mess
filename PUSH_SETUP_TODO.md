# Push Notifications Setup - Remaining Tasks

## ✅ Already Done

| Platform | Status | Details |
|----------|--------|---------|
| **Android (FCM)** | ✅ Ready | `google-services.json` at `src-tauri/gen/android/app/src/main/google-services.json` |
| **Web (VAPID)** | ✅ Ready | `VITE_VAPID_PUBLIC_KEY=BEL5D3vk-mqb0VsdC2rd6drURY9DcVIHCRwfdRl4diAqsJuzw-JKIFSDmeg_GzxlOszE3akGuIqzJGIaTapUI6E` in `.env` |
| **HMR WebSocket** | ✅ Fixed | `vite.config.ts` - explicit `hmr: { host: 'localhost', port: 3000, protocol: 'ws' }` |

---

## 🔴 iOS Push (APNs) - REQUIRES Apple Developer Account

### Required from Apple Developer Console:
1. **APNs Auth Key** (`.p8` file)
   - Go to: Certificates, Identifiers & Profiles → Keys
   - Create new key → Enable "Apple Push Notifications service (APNs)"
   - Download `.p8` file (only once!)
   - Note: **Key ID** (e.g., `ABC123DEF4`)

2. **Team ID**
   - Membership → Team ID (e.g., `TEAM123456`)

3. **Bundle ID** (already in `src-tauri/tauri.conf.json`)
   - Current: `com.messanger.e2e`
   - Must match App ID in Apple Developer Console

### Files to Create/Update:

**1. Place `.p8` file:**
```
src-tauri/certs/AuthKey_XXXXXX.p8
```
(Where XXXXXX = Key ID from step 1)

**2. Update `src-tauri/tauri.conf.json`:**
```json
{
  "plugins": {
    "push": {
      "apns": {
        "keyId": "ABC123DEF4",
        "teamId": "TEAM123456",
        "keyPath": "../certs/AuthKey_ABC123DEF4.p8",
        "production": false
      }
    }
  }
}
```

**3. Add iOS build config** (if not exists):
```json
// In tauri.conf.json > bundle > ios
"ios": {
  "minimumSystemVersion": "16.0",
  "infoPlist": {
    "UIBackgroundModes": ["remote-notification"]
  }
}
```

---

## 🧪 Testing Checklist

### Android (when emulator/device works):
- [ ] `npm run tauri:dev:android` on physical device or stable emulator
- [ ] Settings → Notifications → "Register for Push" → get token
- [ ] Firebase Console → Messaging → Send test message with token
- [ ] Verify notification in background/foreground

### Web (already works):
- [ ] Open http://localhost:3000 in browser
- [ ] Settings → Notifications → "Register for Push"
- [ ] Check console for VAPID token
- [ ] Test local notification

### iOS (when configured):
- [ ] Build iOS: `npm run tauri:build:ios`
- [ ] Install on device via Xcode
- [ ] Grant notification permission
- [ ] Get APNs token from console
- [ ] Test via Firebase Console or APNs direct

---

## 📝 Useful Commands

```bash
# Generate VAPID keys (already done)
npx web-push generate-vapid-keys

# Android dev (specify device if needed)
npm run tauri:dev:android -- --device NovaSmall

# iOS build
npm run tauri:build:ios

# Check connected devices
adb devices

# View Android logs
adb logcat | grep -i push
```

---

## 🔑 Secrets to Keep Safe (NOT in .env)

| Secret | Where Stored |
|--------|--------------|
| VAPID Private Key | Your push server only |
| APNs `.p8` key | `src-tauri/certs/` (gitignored) |
| Google Services JSON | `src-tauri/gen/android/...` (gitignored) |
| Firebase Server Key | Firebase Console only |

---

## 📱 Current Firebase Project
- **Project ID**: `messanger-468dd`
- **Project Number**: `334884542606`
- **Android App**: `com.messanger.e2e`
- **Google Services JSON**: Already placed

---

## ⚠️ Notes

1. **Emulator issues**: Current AVD (NovaTest) keeps going offline. Try:
   - Physical Android device (most reliable)
   - `NovaSmall` AVD
   - `Pixel_10_Pro_XL` AVD

2. **Android 13+**: Must request notification permission at runtime (handled by `requestNotificationPermission()`)

3. **Foreground vs Background**:
   - Background: System notification shade
   - Foreground: `setPushListener()` callback fires

4. **Token format**: Returns `fcm:xxx...` or `apns:xxx...` prefix