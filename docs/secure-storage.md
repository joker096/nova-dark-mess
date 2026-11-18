# Secure storage & deletion guarantees

Scope: where Nova Dark Messenger keeps data at rest, what "delete" actually
means on each platform we ship, and what a native secure-storage design would
have to change. This is the remaining work of roadmap Phase 1.5.

The honest summary up front: message content is encrypted at rest, but the
master key that protects it currently sits in the same origin-local storage as
the ciphertext, and deleted records are not guaranteed to be physically erased.
Neither is a data-loss bug — both are the difference between "hidden from
another app" and "unrecoverable from the device".

## What is stored today

| Data | Where | Protection |
| --- | --- | --- |
| Messages, chats, sessions, drafts, media metadata | IndexedDB `NovaDarkMessengerDB` v2 (`src/lib/storage/db.ts`, stores such as `encrypted_messages`) | AES-GCM per record with the app master key |
| Storage passphrase + salt | `nova_storage_secret` / `nova_storage_salt` (localStorage), minted once per install by `getOrCreateStorageCredentials()` in `src/context/SecurityContext.tsx` | none — plain base64; the AES-GCM key is derived from them at startup and kept only in memory |
| PIN hash | `nova_pin_hash` (localStorage, next to `nova_pin_enabled` / `nova_pin_length`) | SHA-256 over `nova-pin-v1` salt + PIN, `src/context/SecurityContext.tsx` |
| PIN attempt state | `nova_pin_attempts_v1` (localStorage) | none — plain JSON (`src/lib/security/pinAttemptLimiter.ts`) |
| Peer key baseline, theme, onboarding, premium license | origin-local storage | none |

Because the storage passphrase and the ciphertext live in the same origin
storage, an attacker who can read the app's storage (rooted device, unlocked
desktop profile, devtools, an exported browser profile) gets both halves. AES-GCM
at rest therefore buys integrity and keeps message text out of casual
inspection — it does not buy confidentiality against a device-level attacker.
That is the gap a native key store closes, and it is the first item below.

`src/lib/storage/keychain.ts` already sketches the interface for that
(`get`/`set`/`remove`, a `storeMasterKey` helper) but nothing calls it: the
current `createKeychain()` always returns the localStorage implementation, and
the Tauri strongbox path is a comment. It is the natural landing spot for the
change below, not a working protection today.

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
| Android | Chromium WebView, origin-private storage | App-private directory; deletion removes entries from the WebView's LevelDB/SQLite files. Those files are rewritten in place, so old pages can survive in free blocks, and the flash translation layer plus wear leveling can keep stale copies indefinitely. `android:allowBackup` is currently left at the platform default (`true`), so Android's auto-backup may copy app data off-device unless the release manifest opts out. |
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
Cost: touches `keychain.ts` only, but needs per-platform verification and a
migration path for existing installs (re-wrap the key, then delete the old
localStorage entry).

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
  3. confirm an Android release build no longer produces app data in an
     auto-backup (`bmgr` / `adb backup` check).

## Wording constraints

Until notes A and C land, no copy may claim physical erasure, "no trace",
or forensic resistance. Disappearing messages may be described as leaving the
device and its storage API, and the in-memory wipe as best effort.
