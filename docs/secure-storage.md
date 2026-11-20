# Secure storage & deletion guarantees

Scope: where Nova Dark Messenger keeps data at rest, what "delete" actually
means on each platform we ship, and what a native secure-storage design would
have to change. This is the remaining work of roadmap Phase 1.5.

The honest summary up front: message content is encrypted at rest. On desktop
and iOS the passphrase that unlocks it lives in the OS credential store; on
Android it is encrypted with an AES-256 key held by AndroidKeyStore and written
to an app-private file. The Android path compiles for the target but has not yet
been verified on a device. In the browser build the key and the ciphertext share
origin storage. Deleted records are not guaranteed to be physically erased on
any platform. Neither is a data-loss bug — both are the difference between
"hidden from another app" and "unrecoverable from the device".

## What is stored today

| Data | Where | Protection |
| --- | --- | --- |
| Messages, chats, sessions, drafts, media metadata | IndexedDB `NovaDarkMessengerDB` v2 (`src/lib/storage/db.ts`, stores such as `encrypted_messages`) | AES-GCM per record with the app master key |
| Storage passphrase + salt | OS keychain accounts (`nova_storage_secret` / `nova_storage_salt`), minted once per install by `getOrCreateStorageCredentials()` in `src/context/SecurityContext.tsx`. Inside the app shell there is no fallback: if the native store is unavailable the app runs with in-memory keys and says so in Settings. Only the browser dev build uses localStorage `nova_keychain_*` | Keychain/Keystore on a device. The AES-GCM key is derived from them at startup and kept only in memory |
| PIN hash (and salt, enabled flag) | OS keychain accounts, with the legacy `nova_pin_hash` / `nova_pin_enabled` / `nova_pin_length` localStorage values still read | SHA-256 over `nova-pin-v1` salt + PIN (`src/context/SecurityContext.tsx`) |
| PIN attempt state | `nova_pin_attempts_v1` (localStorage) | none — plain JSON (`src/lib/security/pinAttemptLimiter.ts`) |
| Peer key baseline, theme, onboarding, premium license | origin-local storage | none |

Wherever the passphrase still sits in origin storage — the browser build, and
Android whenever the Keystore call fails — an attacker who can read the app's
storage (rooted device, unlocked desktop profile, devtools, an exported browser
profile) gets both halves. AES-GCM at rest therefore buys integrity and keeps
message text out of casual inspection; it does not buy confidentiality against
a device-level attacker. A working native key store closes that gap, which is
why it is the first item below. Desktop, iOS and Android now have one; the
Android path still needs device verification (caveat 1).

`src/lib/storage/keychain.ts` is where that gap is being closed. Inside the
Tauri shell, `createKeychain()` returns an OS-backed store:
`src-tauri/src/keychain.rs` exposes `keychain_get`, `keychain_set` and
`keychain_remove`, backed by the `keyring` crate on Windows/macOS/Linux
(Credential Manager, Keychain, Secret Service), the Security framework on iOS
(generic-password items), and AndroidKeyStore over JNI on Android. The storage
passphrase and salt, the device secret that decrypts the seed phrase, and the
PIN hash/salt all go through it. Values written by older builds under
`nova_keychain_*` are moved into the OS store on first read and the localStorage
copy is dropped.

On Android the JVM is captured from the WebView in `setup` via
`with_webview` + `jni_handle().exec(...)` and stored as a `JavaVM`; there is no
public Tauri `AndroidApp`/`activity()` API. `keychain_available()` returns `true`
there only after that handle is captured. The full native picture, including the
JNI rules and build checks, is in
[docs/TAURI-ANDROID-GUIDE.md](TAURI-ANDROID-GUIDE.md).

Two caveats matter for the guarantee above:

1. **Android is implemented but only compile-verified.** The backend generates a
   per-account AES-256 key inside AndroidKeyStore (`KeyGenerator` +
   `KeyGenParameterSpec`, GCM, no padding), encrypts the value with
   `AES/GCM/NoPadding`, and writes `MAGIC | u32 BE iv_len | iv | ciphertext` to
   `<filesDir>/keystore/<hex(account)>.bin`. The key never leaves the keystore;
   `remove` deletes both the blob and the alias. `keychain_available()` only means
   the JVM and app Context were captured, so the set/get round trip still needs a
   real device or emulator check (`adb` was empty when this was written). If the
   native call throws, `keychain.ts` now raises; see below.
2. **Errors fail closed (since 2026-11-20).** `keychain.ts` has no localStorage
   branch inside the Tauri shell: `keychain_available() === false`, a missing
   `invoke` bridge or any native error throws `KeychainUnavailableError`, and
   `SecurityContext` then keeps key material in memory for the session, reports
   `secureStorage: false`, and Settings shows a warning. The raw master key is
   therefore never written next to the ciphertext, even when the Keystore call
   fails. Two deliberate exceptions remain: a pre-keychain `nova_keychain_*`
   copy is still read once so an existing install is not locked out (and is
   deleted after the OS store accepts it), and an existing but undecryptable
   identity record is never replaced by a freshly minted identity.

The browser build is a development target with no OS store at all, and
`android:allowBackup` is now `false` in the generated manifest, so Android auto
backup no longer copies the WebView directory off-device. Treat device-level
attackers on Android as mitigated by backup closure and hardware-backed key
storage, with device verification still outstanding.

## What deletion means today

Two mechanisms exist, and both are best effort by design:

1. **In-memory wipe** — `secureWipe` / `secureWipeMessage`
   (`src/lib/security/secureWipe.ts`) overwrite sensitive fields (text, media
   URLs, poll, location, sticker, reply reference) and zero out `ArrayBuffer`s
   and typed arrays in place. JavaScript strings are immutable and
   interned, so a wiped string object may still exist in the heap until the GC
   reclaims it. The wipe shortens the window; it does not scrub the heap.
2. **Persistent cleanup** — `purgeExpiredMessages()` in
   `src/lib/storage/db.ts` deletes expired encrypted records on startup, before
   storage reads and exports, and from the active chat. Deleting an IndexedDB
   record removes the key/value from the object store; the underlying bytes on
   disk are another matter.

Coverage: `src/lib/security/secureWipe.test.ts`,
`src/lib/security/pinAttemptLimiter.test.ts` for the retry/backoff logic, and
`tests/secure-wipe.e2e.ts` for the wipe / expiry paths in a real browser.

### Platform deletion guarantees

"Deleted" means the record is unreachable through the storage API on every
engine we ship on. It never means the bytes are gone:

| Platform | Engine / backing store | Guarantee |
| --- | --- | --- |
| Android | Chromium WebView, origin-private storage | App-private directory; deletion removes entries from the WebView's LevelDB/SQLite files. Those files are rewritten in place, so old pages can survive in free blocks, and the flash translation layer plus wear leveling can keep stale copies indefinitely. `android:allowBackup` is `false` in the manifest, so auto-backup does not copy app data off-device; app-private files remain readable on a rooted device. |
| iOS | WKWebView, WebKit origin storage | Same class of guarantee: file-level deletion inside the app container, FTL may retain pages. iCloud device backups include the container unless excluded. |
| Windows | WebView2 (Chromium) | Storage lives under the user profile; deletion is file-level. Anything that snapshots the profile (backup, shadow copy) captured the ciphertext with the key. |
| macOS | WKWebView | As iOS, inside `~/Library`. Time Machine keeps previous versions. |
| Linux | WebKitGTK | As above, under `~/.local/share`. |

Consequences we should state plainly in user-facing text: "disappearing"
messages leave the device no later than the next purge, but recovery of
old pages by a forensic tool with physical access is not prevented. No
overwrite-on-delete is possible from JavaScript or from a WebView API.

## Assessment: what a native secure-storage design would look like

Three candidate directions, from cheapest to most invasive:

**A. OS key store for the storage passphrase (recommended first).**
Keep IndexedDB and its AES-GCM records, but move `nova_storage_secret` out of
localStorage into the platform credential store (through the existing
`keychain.ts` seam) and fail closed if it is missing rather than minting a new
one — a fresh secret would silently orphan every stored message. Effect: reading storage no longer
yields the key, which is the single highest-value change here. Tauri has a
stronghold plugin (an encrypted vault file unlocked by a password or a
device-protected secret) and the platform keyring backends
(Android Keystore / iOS Keychain / Windows Credential Manager / libsecret).
Status: desktop (`keyring`), iOS (Security framework) and Android (AES key in
AndroidKeyStore, encrypted blob in `filesDir`) are implemented, and since
2026-11-20 the seam fails closed (no localStorage write on a device). Android
still needs the device round-trip check from caveat 1. Remaining cost:
per-platform verification; existing installs already migrate on first read.

**B. Encrypted database file instead of IndexedDB.**
SQLCipher or an equivalent encrypted SQLite via Tauri's SQL plugin. Effect:
the whole database is opaque, sizes and record boundaries included; deletion
can additionally `VACUUM`/`secure_delete`, which at least removes record bytes
from free pages. Cost: rewrite of `db.ts` and the migrations, plus keeping the
web build (no SQLite) working — a dual backend is a permanent maintenance tax.

**C. Platform-hardened deletion.**
Set `android:allowBackup="false"` (or a backup rules file that excludes the
WebView directory), exclude the container from iCloud backups, and document
that `VACUUM`-style scrubbing is unavailable on the WebView path. Effect: no
new crypto, no new dependency, and it closes the "ciphertext left the device in
a backup" hole that currently exists by default. Cost: release builds must be
re-verified on a device.

Recommended order: C, then A, then consider B only if the product ever needs
to argue forensic resistance rather than at-rest secrecy.

## Validation plan

- Unit: `secureWipe` / `purgeExpiredMessages` behaviour is covered; add a case
  asserting that a wiped record is actually gone from the store, not merely
  flagged in memory.
- Browser e2e: `tests/secure-wipe.e2e.ts` already drives the expiry path; keep
  it as the regression gate for any storage change.
- Device checks per platform, recorded in `docs/android-ios-verification-plan.md`:
  1. write a message with a 5 s timer, let it expire, confirm it is absent from
     storage inspection (devtools for web, WebView remote debugging for
     Android, Safari Web Inspector for iOS);
  2. confirm the master key is absent from `localStorage` after design A lands;
  3. confirm an Android release build still has `android:allowBackup="false"`
     and produces no app data in an auto-backup (`bmgr` / `adb backup` check);
  4. on Android, confirm `keychain_available()` is `true` and a set/get round
     trip survives an app restart without touching the localStorage fallback;
     confirm `<filesDir>/keystore/*.bin` contains ciphertext only and the key is
     a `SecretKeyEntry` in AndroidKeyStore. This check has not been run yet.

## Wording constraints

Until design A works end-to-end on Android (not merely "the JVM is wired") and deletion hardening is verified on devices, no copy may claim physical
erasure, "no trace", or forensic resistance. Disappearing messages may be
described as leaving the device and its storage API, and the in-memory wipe as
best effort.
