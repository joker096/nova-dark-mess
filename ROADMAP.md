# Nova Dark Messenger — Roadmap

Last updated: 2026-11-16

## Release & CI (GitHub Actions)

Android and iOS are built and published through GitHub Actions, triggered by a
`v*` tag or a manual dispatch (both also accept a version input).

- `ci.yml` — on every push/PR: `tsc`, `eslint`, `vitest`, `npm run build`, and a
  gitleaks secret scan.
- `android.yml` — `windows-latest`: lint + test, then `scripts/deploy-android.ps1`
  runs `tauri android build` (AAB + APK) against a keystore from
  `ANDROID_KEYSTORE_*` secrets; artifacts uploaded to `dist/android/*`.
- `ios.yml` — `macos-latest`: lint + test, CocoaPods, `scripts/deploy-ios.ps1`
  runs `tauri ios build` for a signed IPA using `APPLE_ID` / `APPLE_TEAM_ID`;
  artifacts uploaded to `dist/ios/*`.

Note: the Tauri `nova://` deep-link Activity and iOS `URL Types` must be
regenerated with `tauri android init` / `tauri ios init` (see
`docs/android-ios-verification-plan.md`) before the CI artifacts will honor deep
links on-device — the generated shell in `src-tauri/gen/` is currently a bare
`AppCompatActivity`.

## Guiding constraints (non-negotiable)

1. **No extra servers for core functionality.** Messaging, calls, channels, stories and
   backups must work peer-to-peer or fully on-device. Optional infrastructure (signaling,
   relay) is allowed only as a thin, stateless transport and must never store message
   content or user identity.
2. **No PII collection.** No phone numbers, email addresses, real names or contact
   lists are required to register or use the app. Identity is a self-generated
   cryptographic keypair (BIP-39 mnemonic), discovered by fingerprint / QR / link.
3. **Local-first & encrypted.** All message history stays on the user's devices in
   encrypted storage; cloud sync is opt-in, end-to-end encrypted and user-controlled.
4. **Open, auditable crypto.** Only well-reviewed primitives already in the stack
   (X25519, Ed25519, AES-256-GCM, Double Ratchet, X3DH).

These constraints deliberately exclude several Telegram/WhatsApp features (phone
registration, server-side contact discovery, cloud message storage, push-notification
services, centralized bot platforms). Where a feature needs a server, we either drop
it, replace it with a P2P equivalent, or make it an opt-in self-hosted add-on.

## Where we are today

Already shipped (see `ARCHITECTURE.md`): 1:1 encrypted chats, channels & channel
posts, stories, folders, reactions, replies, voice memos, stickers & emoji, polls,
location sharing, message scheduling, search, themes, PIN lock, TOTP 2FA, seed-phrase
recovery, encrypted `.nova-backup` export/import, local analytics, WebRTC P2P messaging and
audio/video calls with signaling fallback, animated message deletion, an online/offline
mesh map (OSM tiles when connected, dark map + markers/links offline), and Tauri
v2 desktop/Android/iOS shells with `nova://` deep links built by GitHub Actions.

## Comparison: Telegram / WhatsApp vs Nova Dark Messenger

Legend: ✅ shipped · 🟡 partial · ❌ missing · ➖ out of scope (violates constraints)

| Area | Telegram | WhatsApp | Nova Dark | Notes |
|---|---|---|---|---|
| Registration | phone number | phone number | cryptographic identity (mnemonic) | Nova requires no PII |
| Contact discovery | phone book / username | phone book | QR code / fingerprint / invite link | No server-side lookup |
| 1:1 messaging | ✅ cloud | ✅ E2EE | ✅ E2EE | Nova is E2EE by default |
| Group chats | ✅ up to 200k | ✅ up to 1024 | ✅ E2EE Sender Keys | Group creation, member selection, local history, Sender Keys crypto with re-keying and `GroupChatManager` UI wiring in ChatScreen shipped |
| Channels / broadcast | ✅ | ✅ (Channels) | ✅ (channels + posts) | Already shipped |
| Stories / status | ✅ | ✅ (Status) | ✅ (stories) | Already shipped |
| Reactions | ✅ | ✅ | ✅ | |
| Replies / threads | ✅ | ✅ | ✅ full thread view | Thread helpers and modal view dialog shipped |
| Polls | ✅ | ✅ | ✅ | Just shipped |
| Stickers | ✅ (packs, animated) | ✅ | ✅ (static + animated/video packs, import) | On-device packs and local import shipped |
| Location (live) | ✅ | ✅ | ✅ (static + live GPS) | |
| Voice messages | ✅ | ✅ | ✅ | |
| Voice / video calls | ✅ | ✅ | ✅ WebRTC media wired | Audio/video UI, mute/camera, history; simulated fallback until peer fingerprint is available |
| File sharing | ✅ (up to 2 GB) | ✅ (up to 2 GB) | ✅ P2P chunked + SHA-256 | Local attachments, chunked transfer with 100 MB cap, resume, SHA-256 verification and ChatScreen download/send wiring shipped |
| Message edit / delete | ✅ | ✅ (delete for everyone) | ✅ with re-keying | Edit/delete for own messages, polls and stickers with tombstones; coordinated ratchet re-keying after mutations shipped |
| Disappearing messages | ✅ (secret chats) | ✅ (view once, timer) | ✅ view-once + timer | Local expiry timers, view-once mode and secure memory wipe shipped in chat UI |
| Read receipts / typing | ✅ | ✅ | ✅ ephemeral P2P | Ephemeral typing indicators and delivery/read receipts wired via ReceiptManager |
| Multi-device | ✅ (cloud) | ✅ (phone primary) | ✅ two-device sync | Device linking via QR/camera scanner, X25519 handshake and live encrypted history transfer shipped |
| Cloud backup | ✅ | ✅ (Google/Apple) | ✅ encrypted file & cloud | Encrypted `.nova-backup` export plus opt-in WebDAV/S3 upload/restore without leaving keys |
| Search (global) | ✅ | ✅ | ✅ (local chat/channel/media search) | No server index by design |
| Folders / labels | ✅ | ❌ | ✅ | |
| Scheduled messages | ✅ | ❌ | ✅ | |
| Bots / API | ✅ | ✅ (Business API) | ➖ out of scope | No centralized bot platform |
| Payments | ❌ (P2P crypto) | ✅ | 🟡 Premium micro-subscription | PaymentO checkout at $3.90 / 30 days; signed IPN issues a device-bound `MA1.<payload>.<sig>` license key (no PII, no crypto wallets) |
| Usernames | ✅ | ❌ | ✅ deterministic handles | Human-readable handles derived from public key (`nova://<short-id>`); no central registry |
| Premium tier | ✅ | ✅ (Meta Verified) | ✅ local `usePremium` gating | Themes, premium wallpapers, premium sticker packs and channel publish-time picking gated locally; safety features (calls, live location, disappearing messages) stay free on purpose |

## Roadmap

### Phase 0 — Finish in-flight (1–2 sprints) — ✅ Completed

- [x] Merged PR #1 (polls/stickers/location in chats & channels) and the pluralization follow-up.
- [x] Wire media calls (voice/video) into `ChatScreen` using the existing WebRTC layer: real
  local/remote streams, mute/camera toggles, voice-call button and call history in chat
  (`src/lib/p2p/mediaCall.ts`); simulated fallback keeps the demo usable without a peer.
- [x] Ship animated/video stickers and a sticker-pack import (local file), keeping packs on-device.
- [x] Add message edit & delete (for me / for everyone) with tombstone markers for text, polls and stickers.
- [x] Allow changing and removing the user avatar from the profile screen.
- [x] Ratchet re-keying for edit/delete flows: `P2PManager.rekeySession` / `rekeyAllSessions` start a fresh X3DH session (generation-tagged, signed header) so message keys from before the mutation are never reused; the peer accepts the reset only when the generation moves forward, which rejects replayed reset headers. Before re-keying, a stale peer prekey bundle is refreshed (`refreshPeerBundle`) so a rotated signed prekey from the peer is picked up instead of being rejected as unknown; the previous two signed prekeys stay usable for a grace window, so a reset built on an outdated cached bundle still decrypts. Tests in `src/lib/p2p/p2pManager.rekey.test.ts` and `src/lib/p2p/p2pManager.bundles.test.ts`.

### Phase 1 — Core messaging parity (P2P) (2–3 sprints) — ✅ Completed

- [x] **Group chats (small, ≤ 50 members)**: creation, member selection and local history shipped; Sender Keys crypto + group P2P sync manager shipped in `src/lib/crypto/senderKeys.ts` and `src/lib/p2p/groupManager.ts`; out-of-order message keys, sender-key rotation on member removal, and `ChatScreen` UI integration shipped — group sends go through `GroupChatManager.sendText`, decrypted incoming group messages are appended to the transcript, sender-key failures surface as an in-chat toast, and a members dialog (header → Group members) lists the roster, adds members, and removes them with automatic sender-key rotation; roster edits persist for created groups. Join traffic does not depend on an open group: `src/lib/social/joinRequestRelay.ts` keeps an on-device outbox and a session-wide mesh relay (broadcast envelopes) so a request or an admin decision survives closing the chat or the app and is replayed until the relay hands it off; only a group's admins record a relayed request, and a decision only applies to a device that actually asked. Pending requests are counted on the group row in the chats list (with an "awaiting approval" marker for the invitee), so an admin does not have to open every group to notice them. The same dialog mints a shareable deep-link invite (`nova://chat/<id>?invite=<token>` via `src/lib/social/groupInvites.ts`), copies it to the clipboard and can rotate the token; the link carries no message keys, and opening one asks for confirmation before joining (`join-group-dialog` in `App.tsx`). Accepting the invite is only a request to join: `src/lib/social/groupJoinRequests.ts` records the pending membership locally and the device sends `group_join_request` over the room transport, the members dialog lists pending requests for admins with Approve/Reject, and the admin's `group_join_response` either adds the device as a plain member (roles, roster, sender key) or marks it declined — an invitee never seeds itself as admin. While a request is open the invitee sees a waiting banner in the chat, a decline offers "Ask again" (which re-queues the request), and admins get a counter badge on the group-members button until every request is decided. Roster roles are local (`src/lib/social/groupRoles.ts`): the device that opens a group becomes its first admin, admins can promote/demote others, and only admins may add/remove members or rotate the invite token — the last admin cannot be demoted. Role changes sync between devices as `group_roles` payloads over the group transport (remote map wins, local-only members kept), and every add/remove/role change appends an in-chat system event.

- [x] **Real WebRTC DataChannel transport**: `src/lib/p2p/roomChannel.ts` runs a serverless mesh per chat room — peers announce over a same-origin `BroadcastChannel`, exchange SDP/ICE there, and then send group payloads and file chunks over real `RTCPeerConnection` DataChannels with host-only ICE (no STUN/TURN). `ChatScreen` routes group messages and file transfers through it whenever a peer is connected, shows a `P2P · N` badge, and falls back to the local pipeline when WebRTC is unavailable.
- [x] **File sharing** over WebRTC DataChannel with chunking, resume, and SHA-256 integrity; size cap configurable (default 100 MB to stay device-friendly). (Chunked transfer manager shipped in `src/lib/p2p/fileTransfer.ts`; 100 MB cap, incoming metadata/chunk validation, cancel, resume-index hardening and `ChatScreen` send/download UI wiring shipped — attachments and document downloads run through the real chunking/ack/SHA-256 pipeline with a floating progress card, cancel button and a verified-delivery toast.)
- [x] **Disappearing messages & view-once media**: local timers (5s, 10s, 30s, 60s), view-once mode toggle and secure memory wipe shipped in `ChatScreen`.
- [x] **Delivery & read receipts + typing indicators** as ephemeral P2P signals (no persistence). (Signal manager shipped in `src/lib/p2p/receipts.ts`; typing and read signals wired into `ChatScreen` input and lifecycle.)
- [x] **Message threads / replies view** and pinned messages per chat. (Thread dialog now renders full nested thread via `getThreadMessages`.)
- [x] **Global search** across chats, channels and media (local index, no server). (Search helpers shipped in `src/lib/search/globalSearch.ts`; ChatsScreen now searches the local index across text, documents, polls, locations and media.)

### Phase 2 — Multi-device & identity (2 sprints) — ✅ Completed

- [x] **Device linking core & handshake**: X25519 offer + encrypted history sync shipped in `src/lib/p2p/deviceLinking.ts`; profile modal renders a real signed offer QR/code and completes the two-device handshake — paste the link on the new device, hand the reply code back, session completes with zero servers.
- [x] **Device linking live sync**: QR camera scanning, camera viewfinder preview and live encrypted history stream transfer over the active session shipped.
- [x] **Human-readable handles** derived from public key (e.g. `nova://<short-id>`) plus optional self-asserted display name; no central registry. (Derivation shipped in `src/lib/crypto/handles.ts`; profile screen shows deterministic handle instead of fingerprint slice.)
- [x] **Encrypted cloud backup (opt-in)** to a user-selected WebDAV/S3-compatible endpoint, keys never leave device. (Transport shipped in `src/lib/storage/cloudBackup.ts`; settings backup dialog uploads encrypted blob to chosen endpoint and restores from it. Credentials stay in memory for session.)
- [x] **Offline message queue & relay**: localStorage-backed queue utility shipped in `src/lib/network/offlineQueue.ts`; store-and-forward relay integration shipped in `src/lib/network/offlineRelay.ts`; queue/flush tests added. Group join requests and decisions use the same store-and-forward idea through `JoinRequestRelay`, which keeps working while the group is closed.

### Phase 3 — Channels & communities (1–2 sprints) — ✅ Completed

- [x] **Channel admin tools**: scheduled posts, edit/delete, reactions, comments, subscriber count privacy shipped.
- [x] **Communities**: a channel + linked discussion group, moderated locally by admins. (Model/store in `src/lib/social/communities.ts`; UI in `src/components/CommunitiesPanel.tsx` — the Channels folder lists communities with a local admin badge, opens the linked channel or discussion group, a create dialog pairs a channel with a group, and every community can be renamed, re-pointed at another channel/discussion group, or deleted with an inline confirmation. Stored on-device only.)
- [x] **Live location sharing in groups** with expiry and geofencing (fan-out manager shipped in `src/lib/p2p/liveLocation.ts`).
- [x] **Broadcast lists** (WhatsApp-style) implemented as fan-out over P2P connections. (Fan-out manager shipped in `src/lib/p2p/broadcastManager.ts`.)

### Phase 4 — Hardening & UX polish (ongoing)

- [x] **Metadata minimization**: padding, cover traffic, randomized message timing to resist traffic analysis (opt-in, battery-aware). (Helpers shipped in `src/lib/network/metadataMinimization.ts`; `src/lib/network/privacyMode.ts` adds persisted opt-in plus battery-aware cover-traffic decisions, with a toggle in Settings → Privacy.)
- [x] **Sealed sender** for 1:1 messages where feasible. (X25519 sealed box shipped in `src/lib/messaging/sealedSender.ts`.)
- [x] **Safety numbers / key verification**: safety number + QR modal shipped; emoji fingerprint comparison and deterministic safety-number derivation shipped in `src/lib/crypto/safetyNumbers.ts`.
- [x] **Accessibility & i18n**: audit script covers all 10 locales (`scripts/audit-i18n.ts`); zero empty keys; RTL audit for ar.
- [x] **Performance**: virtualized message lists (`src/components/VirtualizedList.tsx`), lazy media loading (`src/components/LazyMedia.tsx`).
- [x] **Premium tier hardening**: one entitlement list in `src/lib/premium.ts` (`PremiumFeature` + `PREMIUM_FEATURES`), so a feature name either is sold or is not — the dead feature argument is gone. Premium wallpapers are flagged in `src/data/wallpapers.ts` and locked in the wallpaper modal (click opens the local checkout, with a Premium badge and keyboard support), while chat themes, premium sticker packs and channel publish-time picking keep their existing gates. Safety features are never gated.
- [x] **Desktop & mobile parity**: deep links for invite URLs (`src/lib/network/deepLinks.ts`), OS keychain abstraction for master key (`src/lib/storage/keychain.ts`), Tauri v2 integration: the `deep-link` plugin (Rust + JS) is registered, `nova://` is declared for desktop and the Android/iOS shells, the webview replays the launching link through `src/lib/network/tauriDeepLinks.ts` (hash links keep working in the browser), and the bundle carries explicit mobile settings (Android min SDK 24 plus optional camera/microphone features, iOS 15 minimum).

### Phase 5 — Next up

- [x] Retry join-request relay traffic with backoff instead of a fixed 10 s tick, and surface undelivered jobs in Settings. (`joinRetryDelay` doubles 5 s → 5 min per failed attempt and is stored on each outbox job as `nextAttemptAt`, so a failed flush no longer retries on every tick; the app session schedules its next wake from `nextJoinOutboxDelay()` and only polls every 15 s when the outbox is idle. Settings → Join request delivery shows the queued count and a "Retry now" button that clears the backoff and flushes through the live session relay.)
- [x] One-tap approve/decline for pending join requests from the chats list, without opening the group. (`src/lib/social/joinDecisions.ts` checks the admin role, adds an approved peer to the local roster, records the decision and hands the answer to the session relay outbox; the chat row renders the pending requesters with Approve/Reject buttons that do not open the chat.)
- [x] In-app notice for new join requests on any screen (not only inside the group chat). (`JoinRequestNotice` overlay is mounted in `App.tsx`; a relayed request that is not aimed at the group already on screen shows the requester and group with an "Open" action, auto-dismissing after 8 s.)
- [x] Verify the Android bundle end to end (`nova://` link opens the app, camera + mic permissions).
  - **Status (2026-11-14):** `MainActivity.kt` extends `TauriActivity()`, `nova://` is declared in `tauri.conf.json` plugins.deep-link (mobile) and lands in the merged manifest, and `src-tauri/src/lib.rs` allows Camera/Microphone permission requests. A local x86_64 debug APK was installed on an emulator: `am start -a android.intent.action.VIEW -d "nova://chat/ci-smoke-test"` resumed `com.messanger.e2e.debug` with the link intact, and `pm grant` succeeded for `CAMERA` and `RECORD_AUDIO`.
  - **Automated check:** `.github/workflows/android-e2e.yml` builds the debug APK and runs `scripts/android-e2e.mjs` on an API 35 emulator; the script opens the deep link, asserts the resumed activity, grants both permissions, calls `getUserMedia({video:true})` / `({audio:true})` inside the WebView through the Chrome DevTools Protocol, and fails on any logcat `FATAL EXCEPTION`, native crash or ANR for the app package. The local API 37 (16 KB page size) image crashes `surfaceflinger`, so it is not used for the final check.
  - **Confirmed (2026-11-14):** the workflow ran green on `agent-sharing-to-chats-5a5a` (run [43644521565](https://github.com/joker096/nova-dark-mess/actions/runs/43644521565), 11m37s). Log highlights: manifest declares CAMERA/RECORD_AUDIO/MODIFY_AUDIO_SETTINGS, both runtime permissions granted, `nova://chat/ci-smoke-test` opened `com.messanger.e2e.debug` and the activity kept the link, `getUserMedia` returned live camera and microphone streams inside the WebView, and no FATAL EXCEPTION, native crash or ANR was logged for the package. Note: the pushed workflow at that time had no `workflow_dispatch` trigger, so the run was triggered by the pull request.
- [x] Production relay transport for store-and-forward when none of the peers' devices is online. (Thin, stateless: `server.js` exposes `POST /api/relay` (store encrypted envelope) and `GET /api/relay/:destination` (fetch + delete pending); storage is opaque encrypted blobs with a 7-day TTL and a per-destination cap, no PII. Client: `src/lib/p2p/httpRelay.ts` (`pushRelayEnvelope` / `pullRelayEnvelopes` / `HttpRelayTransport`). `server.js` converted to ESM so it actually runs under the project's `"type": "module"`.)
- [x] **Premium payments via PaymentO** (in scope: flat $3.90 per 30 days, no PII, no crypto). Frontend checkout in `src/lib/premium.ts` (`checkoutPremium()`) and the promo landing (`landing/paymento.js` + `#paymento-checkout` buttons). Backend receipt ledger: `server.js` serves the landing at the site root and exposes `POST /api/paymento/ipn` (HMAC-SHA256 verified, PII-stripped receipt in `receipts/`, `GET /api/paymento/receipts` audit list, `GET /api/health`). Deploy: `npm run deploy:landing` → `scripts/publish-landing.js` stages `landing-deploy/` + `server.js` for the host.
- [x] Wire the in-app `CryptoCheckoutModal.tsx` to `checkoutPremium()` so the desktop/mobile app opens the real PaymentO checkout instead of the fake crypto addresses. (The modal no longer shows fake currency addresses; it presents the $3.90 / 30-day amount taken from `MIN_SUBSCRIPTION_COST` and a single Pay button that calls `checkoutPremium()`, which invokes the PaymentO widget when present and falls back to a 30-day local activation in dev. A verified IPN mints a 30-day `MA1.<payload>.<sig>` license bound to the device id; the app stores it in `nova_premium_license`/`_expiry`/`_verified_at` and checks it with `/api/premium/status`.)
- [x] Local/dev secrets filled in `.env` (keystore passwords rotated, `messandanger-keystore.jks` regenerated with a fresh RSA key; PaymentO/Cloudflare/Supabase placeholders replaced with generated values). Production values still require creating the PaymentO store "Mess&Anger user" (plan `premium`, amount=49, currency=usd) and pasting the real API key / IPN HMAC secret.
- [x] Landing bundle staged (`npm run deploy:landing` → `landing-deploy/`, 19 entries, build OK). Actual upload to `https://mess.cvr.name/` requires SSH host access (run `node scripts/publish-landing.js --deploy <user@host>` or scp manually) and registering the IPN URL in PaymentO store settings.

### Phase 6 — Real data & first-run UX (2026-11-15) — ✅ Completed

- [x] **First-run wizard instead of a fake greeting.** A new install is gated
  on `nova_onboarding_v1` (`src/lib/onboarding.ts`); until setup is finished the
  app renders `src/components/OnboardingWizard.tsx` instead of the chat list, so
  nobody starts as "Hello, Joseph". The wizard is a single flow with a progress
  bar: welcome → *create a new identity* / *restore from before* → display name →
  recovery phrase (24 words, copy, "I saved my phrase") or phrase input with
  validation → optional 4-digit PIN → done. Restoring derives the same keypair
  from the mnemonic (`restoreIdentityFromMnemonic` in `SecurityContext`), so the
  fingerprint — and therefore contacts and safety numbers — stay stable.
- [x] **Mesh map shows real peers.** `src/lib/p2p/meshMapNodes.ts` builds the
  live snapshot from the session relay plus the last saved GPS fix; the demo
  topology is now opt-in behind a "Show sample" toggle and the empty state
  explains how to get a node (open a chat with an online peer or share live
  location). "Locate me" asks for geolocation and re-fits the bounds, and a
  `nova-gps-fix` event refreshes the map as soon as a fix is stored.
- [x] **Premium is discoverable.** A Premium button sits in the chats header and
  opens the real PaymentO checkout; the price is stated as **$3.90 per 30 days**
  (not "USD / month"), and checkout failures (blocked window, unreachable
  service, payment pending) are shown as localized messages instead of being
  swallowed by `usePremium.checkout()`.
- [x] **Terms and Privacy are real documents.** `src/lib/legal.ts` holds both
  texts, `src/components/LegalModal.tsx` renders them in-app with an "Open full
  version" link, and the hosted copies live at
  `https://mess.cvr.name/{terms,privacy}.html` (staged from `landing/`).
- [x] **One z-index scale.** `src/lib/ui/zIndex.ts` defines the layers
  (backdrop 40, menus 50, sheets 70, modals 80, nested modals 90, toast 120);
  Settings, the crypto checkout, the legal modal and the chat action menu were
  moved onto it so a dialog can no longer open underneath the one that spawned
  it.
- [x] **Media no longer blocked by CSP.** `index.html` now allows
  `media-src 'self' blob: https:` and `blob:` in `img-src`, so remote sample
  media and locally recorded voice notes both play.
- [x] **Chat action menu localized** (`chat.contactInfo`, `chat.mediaLinks`,
  `chat.appearance`, `chat.chatTheme`, `chat.scheduledCount`) in all 10 locales,
  restoring key parity in `npm run audit:i18n`.

**Still open in this area**

- [x] Localize the chats header greeting (`Hello, {{name}}`).
- [x] Feed the mesh map from relay presence (`/api/presence` heartbeat + fetch,
  peers shown as online nodes).
- [x] Add a "run setup again" action in Settings (`resetOnboarding()` + reload).

### Phase 7 — Translation, release readiness & quality (next, 1–2 sprints)

**Goal:** turn the now-complete feature set into a shippable, trustworthy 1.0:
real translations, a live deployment, green mobile CI, and a verified payment.

- [ ] **Translate the scaffolded locales** (fr, pt, it, pl, nl, sv, zh, ja, ko, hi).
  Priority: onboarding, settings, chat, premium, legal. Keep `npm run audit:i18n`
  green and add a "translation coverage" metric to CI.
- [ ] **Deploy landing + server** to `mess.cvr.name`: `landing/terms.html`,
  `/api/presence`, PaymentO IPN URL registration, PM2 restart, health check.
  Smoke-test the hosted Terms/Privacy URLs and the presence endpoint.
- [ ] **Mobile CI green on the pushed commit**: add `workflow_dispatch` to
  `android-e2e.yml`, run it; fix the iOS build (`ios.yml`) and verify deep links
  on a real device.
- [ ] **End-to-end Premium payment** in staging: real IPN → signed `MA1.*`
  license → `/api/premium/status` → app unlocks features; document the operator
  steps (store "Mess&Anger user", API key, HMAC secret).
- [ ] **Code-splitting**: split the 675 kB main chunk (lazy-load MeshMap, Profile,
  Settings, Onboarding already lazy where possible) and raise the chunk warning
  threshold only after measuring.
- [ ] **Accessibility pass**: keyboard navigation + focus traps in all modals,
  ARIA labels, contrast check, RTL verification for ar (and he if added).
- [ ] **Test coverage for new surfaces**: OnboardingWizard, MeshMap, presence
  helpers, LegalModal, language picker; add a visual snapshot for the wizard.
- [ ] **Dev ergonomics**: allow `http://localhost:8080` in `connect-src` only in
  dev builds (via Vite env) so local checkout/presence work without weakening
  production CSP.
- [ ] **Release checklist doc** (`docs/release-checklist.md`): version bump,
  changelog, tag, CI artifacts, store upload, smoke test.

### Phase 8 — Advanced P2P & long-term (later)

- [ ] **Presence privacy**: opt-in toggle, shorter/longer TTL, optional hashing so
  the relay never sees raw fingerprints; document the metadata trade-off.
- [ ] **Calls without simulated fallback**: real WebRTC media end-to-end, optional
  self-hosted TURN, call quality indicators.
- [ ] **Resumable file transfers** across app restarts (persist transfer state).
- [ ] **Backup verification**: dry-run restore, checksum, "test restore" button.
- [ ] **Performance**: media cache with eviction, image thumbnails, faster cold start
  on low-end Android.
- [ ] **Optional self-hosted add-ons**: webhook/plugin model (local only),
  user-run signaling/relay gateways, documented but never required.

## Recent changes (2026-11-15)

- **Back navigation restores the previous view.** `App.tsx` keeps a
  `navHistory` stack: `navigate()` records the current screen plus active
  chat/profile/channel before switching, `goBack()` restores it, and every back
  handler (chat, profile, channel, analytics, mesh map) uses it instead of a
  hard-coded destination. With an empty stack back still lands on the chats
  list. Covered by `src/App.test.tsx`.

## Recent changes (2026-11-13)

- **Animated message deletion with full removal.** Deleting a message plays a
  bubble collapse animation (`msg-deleting`, 300 ms in `src/index.css`) and then
  physically removes the message from state — no leftover "This message was
  deleted" tombstone. "Delete for everyone" still runs `secureWipeMessage`;
  "delete for me" is a plain drop. See `handleDeleteMessage` in
  `src/components/ChatScreen.tsx` and `src/components/ChatScreen.test.tsx`.
- **Mesh map online/offline.** `src/components/MeshMap.tsx` gates the OSM
  `TileLayer` behind a `useOnline()` hook (`navigator.onLine` + `online`/`offline`
  events). With a connection the map renders normal OSM tiles; offline the tile
  layer is not mounted (no tile requests) and the dark `#151722` canvas shows
  mesh nodes and links only. Leaflet dark theming lives in
  `src/components/mesh-map.css`.

## Explicitly out of scope

- Phone-number or email registration and server-side contact discovery.
- Centralized cloud storage of plaintext or ciphertext messages.
- Push notifications via third-party services (FCM/APNs) — replaced by in-app polling over P2P or user-opt-in self-hosted gateways.
- A bot/API platform requiring a central server (a local webhook/plugin model may be explored later).
- Crypto wallets, on-chain payments, or blockchain in-app purchases. (A single flat **Premium micro-subscription** via PaymentO is in scope — see Phase 5; it collects no PII and stores no message content.)

## Success metrics

- A new user can register, add a contact and exchange an encrypted message with **zero network requests** in the default configuration.
- Group chat of 10 members works over LAN with no signaling server.
- No PII is present in any persisted storage key or network payload (audited via `tests/` + manual review).
- All user-facing strings pass i18n parity tests (`src/lib/i18n.test.ts`).
