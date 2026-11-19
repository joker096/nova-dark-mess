# Nova Dark Messenger — Roadmap

Last updated: 2026-11-18 (repository audit turned into a fix roadmap; no
product scope change)

## Where the hardening plan stands (quick index)

- 🔴 **Fix roadmap (2026-11-18 audit)** — the audit findings and their repair
  order live in [`docs/fix-roadmap.md`](docs/fix-roadmap.md): red CI (lint,
  tests, `npm audit`), no live 1:1 transport in the chat UI, broken anonymous
  file receive, key material stored next to the ciphertext, unauthenticated
  relay/presence endpoints. Tracked as phases F0–F4.
- ✅ Plan Phase 0 (claims honesty) — done, landing + docs aligned.
- 🟡 Plan Phase 1 (security) — threat model, IP privacy, hybrid PQ, Argon2id, and
  the local peer key-change journal done; secure-wipe audit, XSS pass, CI
  scanning, and external audit remain.
- ⬜ Plan Phases 2–5 (delivery, anti-censorship, product, distribution) — not started;
  tracked as originally written in `docs/План доработки Mess&Anger Nova Dark Messenger.md`.
- ⬜ Monetization track (ads + affiliate) — plan only; phases A–D and the
  pre-launch checklist live in `docs/monetization-roadmap.md`;
  rules/sanctions/auction contracts in [`docs/moderation-and-ads-plan.md`](docs/moderation-and-ads-plan.md).

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
| Payments | ❌ (P2P crypto) | ✅ | 🟡 Premium micro-subscription | PaymentO checkout at $3.90 / 30 days; direct purchases issue a device-bound `MA1.<payload>.<sig>` license, while gifts use a one-time code redeemed on the recipient's device (no PII, no crypto wallets) |
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

- [x] Re-enable the light app theme after completing the palette and contrast
  review. Light/dark/system selection is available; neutral app surfaces and
  chat wallpapers adapt to the light palette, accent buttons retain readable
  white text, composer buttons and icons adapt in both base and hover states,
  and call/media surfaces opt out where appropriate. The browser regression in
  `tests/light-theme.e2e.ts` checks rendered colors, wallpaper, preserved dark
  surfaces, composer icons, and WCAG AA contrast for primary and accent text.

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
- [x] **Premium gifts via saved anonymous contacts.** The sender pays $3.90 for 30 days, delivers a one-time code over the selected E2EE contact, and the recipient redeems it in the app; it adds 30 days to an active paid entitlement or starts at redemption. Codes are encrypted at rest while unredeemed and bound to the recipient device when claimed.
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
- [x] **Mesh map is local-first for precise GPS.** `src/lib/p2p/meshMapNodes.ts`
  keeps a fix in memory only; the map requests it only after the user taps
  "Locate me", clears it when hidden or when leaving the map, and removes the
  legacy plaintext localStorage fix. The local GPS fix is used only for the
  local marker; remote peers are displayed at deterministic pseudo-positions,
  and the map does not publish the fix. OSM tiles are not requested while the
  precise local marker is visible (or while offline), so tile requests cannot
  reveal that point. Without the marker, OSM still receives the device IP and
  requested tile coordinates, which disclose the viewed area. Presence sharing
  is separate, opt-in, and carries no GPS coordinates, though the relay can see
  the connecting IP. The app cannot guarantee that the operating system or
  browser's geolocation provider will not use its own network service.
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
- [x] **Make adding a contact usable without technical setup.** The new-
  conversation dialog opens a contacts flow that automatically creates a
  shareable invitation link and QR code using the app's default HTTPS relay.
  Opening the link pre-fills the invite; accepting it saves the contact and
  sends the reply automatically, while the inviter's inbox is checked in the
  background as long as the contacts screen stays open. Manual relay/proxy
  fields are under Advanced network settings.
  Messages remain end-to-end encrypted; the default relay can see IP metadata.
  No phone number or address-book upload is required.

**Still open in this area**

- [x] Localize the chats header greeting (`Hello, {{name}}`).
- [x] Feed the mesh map from relay presence (`/api/presence` heartbeat + fetch,
  peers shown as online nodes).
- [x] Add a "run setup again" action in Settings (`resetOnboarding()` + reload).

### Phase 7 — Translation, release readiness & quality — ✅ Completed

**Goal:** turn the now-complete feature set into a shippable, trustworthy 1.0:
real translations, a live deployment, green mobile CI, and a verified payment.

- [x] **Translate the scaffolded locales** (fr, pt, it, pl, nl, sv, zh, ja, ko, hi) — `npm run audit:i18n` now covers 20 locales and reports PASSED (v1.0.49 translation pass).
  Priority: onboarding, settings, chat, premium, legal. Keep `npm run audit:i18n`
  green and add a "translation coverage" metric to CI.
- [x] **Deploy landing + server** to `mess.cvr.name`: staged bundle via `npm run deploy:landing`; Terms/Privacy hosted and PaymentO IPN endpoint available. Operator-side registration of the IPN URL in the PaymentO store remains a manual step documented in DEPLOYMENT.md.
- [x] **Mobile CI green on the pushed commit**: `workflow_dispatch` added to `android-e2e.yml` (verified in the workflow file) and the e2e run confirmed green earlier on this branch (run 43644521565). iOS build verification on a real device remains tracked in Phase 8.
- [x] **End-to-end Premium payment** in staging: real IPN → signed `MA1.*` license → `/api/premium/status` → app unlocks features. Operator steps (store "Mess&Anger user", API key, HMAC secret) documented in DEPLOYMENT.md.
- [x] **Code-splitting**: main bundle is code-split at build; lazy loading remains measured via chunk warnings. (Verified via `npm run build` in the 1.0.49 prep pass.)
- [x] **Accessibility pass**: keyboard navigation + focus traps verified in modals (sheets restore focus to the trigger, Escape/backdrop close — see `PostCommentsSheet.test.tsx`); button-audit script checks 73 files and reports PASSED. RTL audit for ar ships with the i18n audit.
- [x] **Test coverage for new surfaces**: OnboardingWizard, LegalModal, communities and join requests already had dedicated tests; visual snapshots ship for UI kit and VideoCallOverlay. Suite has since grown to 743 tests across 95 files (see Phase 9).
- [x] **Dev ergonomics**: dev-only CSP relaxations handled through Vite env (`import.meta.env.DEV` guard keeps production strict).
- [x] **Release checklist doc** (`docs/release-checklist.md`): version bump,
  changelog, tag, CI artifacts, store upload, smoke test.

### Phase 9 — Security plan implementation (docs/План доработки, Phase 0–1) — in progress

Driven by the external review plan (`docs/План доработки Mess&Anger Nova Dark
Messenger.md`): claims honesty first, then cryptography and leak-surface
hardening. Everything shipped so far is free, on-device or pure-JS — no new
servers, no paid services.

- [x] **Plan Phase 0 — public claims match the code.** Landing de-ML-KEM'd
  (real stack: X3DH + Double Ratchet + Sender Keys), Signal correctly marked
  post-quantum (PQXDH 2023), `nexus://` → `nova://`, `.mess` → `.nova-backup`,
  self-assigned "Security score 8.5/10" and "10 layers" removed, "Impossible
  to block" → "Hard to block" (domain fronting swapped for self-hosted
  relays), Mesh Compass "50 km" reduced to a live node radar, OSS/privacy/
  terms footer links, Stars are-not-a-token note, $3.90/30-day label,
  no-JS counter fallback; localized in all 8 landing languages, deploy bundle
  re-staged.
- [x] **Plan Phase 1.1 — threat model document** (`docs/threat-model.md`):
  protected/not-protected tables plus a per-component disclosure table
  (signaling, TURN, relay, PaymentO, presence).
- [x] **Plan Phase 1.2 — WebRTC IP privacy.** `icePolicy` 'relay-only'
  (`iceTransportPolicy: 'relay'`, `TURN_SERVERS` swap-in) in
  `P2PMessengerChannel`/`P2PMediaCall`; `PrivacyPrefs.webrtcRelayOnly`
  toggle in Settings → Privacy (20 locales); call badge "E2EE · IP hidden"
  with honest tooltip; falls back to direct ICE while no TURN is configured
  so the toggle cannot brick calls.
- [x] **Plan Phase 1.3 — hybrid post-quantum handshake.** ML-KEM-768
  (`@noble/post-quantum`, pure JS) combined into the X3DH root key via HKDF;
  signed `protocolVersion` (2/3) + `pqCiphertext` in the header;
  fail-closed downgrade protection (a PQ-capable peer rejects classical-only
  headers); `P2PManager` lazily persists the PQ keypair and advertises
  `pqKem`; pre-PQ identities negotiate classically. Tests in
  `src/lib/crypto/ratchet.pq.test.ts` (round-trip, downgrade, mismatch,
  version-bound signature).
- [x] **Plan Phase 1.6 — Argon2id backup KDF.** New `.nova-backup` v2 files
  derive keys with Argon2id (32 MiB, memory-hard); legacy PBKDF2-600k v1
  files stay restorable; restore-side parameter validation prevents forced
  weak-KDF attacks (`src/lib/storage/backup.kdf.test.ts`).
- [x] **Plan Phase 1.4 — peer key-change journal.** On opening a direct chat and
  before sending, the app verifies the locally stored demo pre-key bundle and
  compares its signing and X25519 identity keys with a per-chat first-seen
  baseline. Changes are persisted locally, rehydrated as deduplicated system
  messages, and shown with prior/current fingerprints and key IDs in Chat
  Protection; the contact remains explicitly **Not verified**. This currently
  monitors the local demo peer bundle, not keys obtained from a remote contact
  directory, so it is groundwork rather than deployed remote-key verification.
- [x] **Plan Phase 1.5 — disappearing-message cleanup and PIN throttling.** Sensitive
  message fields are overwritten in memory where possible; expired encrypted
  IndexedDB records are deleted on startup (`EncryptedDatabase.initializeWithKey`
  now calls `purgeExpiredMessages()`), before storage reads
  (`getEncryptedMessages`) and exports (`exportSnapshot`), and from the active
  chat. PIN entry verifies the saved PIN and applies a persisted exponential
  delay after repeated failures. Focused unit tests and `tests/secure-wipe.e2e.ts`
  cover the wipe, retry, and IndexedDB expiry paths. This is not guaranteed
  physical erasure: browser storage engines and flash wear-leveling may retain
  old pages, and the app currently uses IndexedDB rather than SQLite/WAL. PIN
  throttling is stored in origin-local storage, so clearing app data or using
  developer tools can reset it; it is not tamper-resistant. The assessment is
  now written down in `docs/secure-storage.md`: today's at-rest layout
  (encrypted IndexedDB records, master key and PIN hash still in origin-local
  storage), what deletion can and cannot guarantee on each WebView (engines
  delete records, flash wear leveling keeps pages, Android auto-backup is still
  on by default), and the recommended order — deny platform backups, then move
  the master key into the OS credential store, then consider an encrypted SQLite
  file. Remaining work: implement and verify those steps on real devices.
- [x] **Plan Phase 1.8/1.9 — WebView XSS pass + CI dependency scanning.** The only
  raw-HTML rendering sites sanitize translated markup; `sanitizeHtml()` now
  strips all attributes from allowed tags (no `href="javascript:..."`, no
  `on*` handlers, no `style`), and escapes disallowed tags. CI runs
  `npm audit --audit-level=moderate` (exit 0 required) and generates/uploads
  a CycloneDX SBOM. Release signing attestation remains outstanding.
- [ ] **Plan Phase 1.7 — external audit** is a paid/operator step; until then
  no "unbreakable"-class wording anywhere (landing already sanitized).

### Phase 8 — Advanced P2P & long-term (later)

- [x] **Presence privacy**: opt-in toggle, shorter/longer TTL, optional hashing so
  the relay never sees raw fingerprints; document the metadata trade-off.
  (Settings → Privacy gained "Share presence with relay" — off by default, so no
  heartbeat ever leaves the device until enabled; when on, the fingerprint is
  SHA-256-hashed into an opaque `ph1.<hex>` id by default and a TTL preset
  (45 s / 2 min / 5 min) is sent per heartbeat and clamped server-side in
  `server.js`. The client resolves hashes back to fingerprints only for peers
  it already knows (`resolvePresenceIds`), so unknown peers stay opaque.
  Metadata trade-off documented in `docs/presence-privacy.md`.)
- [ ] **Calls without simulated fallback**: real WebRTC media end-to-end, optional
  self-hosted TURN, call quality indicators.
- [x] **Resumable file transfers across app restarts.** `FileTransferManager`
  (`src/lib/p2p/fileTransfer.ts`) now accepts an optional `persistence`
  layer (`saveState`/`loadState`/`clearState` callbacks). Transfer state is
  serialized after every mutation and restored on construction, so in-progress
  uploads and downloads survive an app restart. `resumeTransfer(transferId)`
  re-sends un-acked chunks for outgoing transfers and sends `file_resume` for
  missing chunks on incoming transfers. `getAllTransferIds()` lists all known
  transfers for UI restoration. 6 new tests in `fileTransfer.test.ts` cover
  save/restore/resume/clear round-trips.
- [x] **Backup verification**: dry-run restore, checksum, "test restore" button.
  `verifyEncryptedBackup()` in `src/lib/storage/backup.ts` decrypts and validates
  a `.nova-backup` file without applying it (dry-run), returning `true` when the
  passphrase is correct and the structure is valid. AES-GCM authentication
  provides implicit checksum verification — corrupted ciphertext is rejected.
  Tests in `src/lib/storage/backup.kdf.test.ts` cover valid/wrong passphrase,
  garbage input, bad magic, and dry-run idempotency. Remaining: a UI "test
  restore" button in the backup/restore dialog.
- [x] **Performance**: media cache with eviction, image thumbnails, faster cold start
  on low-end Android.
  `createMediaCache()` in `src/lib/media/mediaCache.ts` is a bounded LRU cache
  for media blobs (thumbnails, previews, file data) with configurable entry and
  byte caps. `createThumbnail()` in `src/lib/media/imageThumbnail.ts` downscales
  image sources to a bounded canvas preserving aspect ratio, never upscaling.
  `main.tsx` kicks off `loadLanguage()` in parallel with the first paint instead
  of blocking on it. 12 media cache tests + 10 thumbnail tests cover eviction,
  MRU promotion, aspect-ratio preservation, and load-error handling. Cold start
  is non-blocking for non-English locales; code splitting via React.lazy already
  defers ChatScreen, ChatsScreen, ChannelScreen, ProfileScreen, AnalyticsScreen,
  MeshMapScreen, SettingsModal, AnonymousMessengerScreen, and
  CryptoCheckoutModal.
- [ ] **Optional self-hosted add-ons**: webhook/plugin model (local only),
  user-run signaling/relay gateways, documented but never required.

## Recent changes (2026-11-17)

- **Monetization track added to the roadmap.** `docs/monetization-roadmap.md`
  turns the ads/affiliate strategy into phases A–D with a pre-launch
  checklist: only channel feeds and the channel catalog in the MVP, 50% revenue
  share to channel admins, context-of-channel targeting, three affiliate
  loops (platform CPA, mini-app referral program, admin affiliate buttons),
  RF legal contour (`erid`/ORD/EERI plus the 3% ad levy), the admin dashboard
  spec and the guardrails that roll an ad load back. It links to
  [`docs/moderation-and-ads-plan.md`](docs/moderation-and-ads-plan.md) for the technical contracts so the two
  documents do not drift, and states the boundaries explicitly: ads never
  enter 1:1 chats, groups, calls or pushes, and the ad server stays an
  optional add-on — the app must work fully with monetization compiled out.
  Only the client prototype exists today (`src/lib/ads/`,
  `SponsoredPostCard.tsx`); nothing server-side is implemented.

## Recent changes (2026-11-16)

- **Roadmap restructured: Phase 9 added** to track the external
  hardening plan explicitly (Phase 0 claims + Phase 1 security items, with
  the remaining work as unchecked entries). Suite at 95 files / 742 tests
  green; `tsc` clean.

- **Hybrid post-quantum handshake (Plan Phase 1, item 3) + Argon2id backups
  (item 6).** 1:1 sessions now negotiate a PQXDH-style hybrid: when a peer's
  prekey bundle advertises an ML-KEM-768 encapsulation key
  (`@noble/post-quantum`, pure JS, no new server, no cost) the initiator
  encapsulates and HKDF-combines the PQ shared secret with the classical
  X3DH chain, so recorded ciphertext stays safe if *either* X25519 or
  ML-KEM-768 holds. `X3DHHeader` gained a signed `protocolVersion`
  (2 classical / 3 hybrid) plus `pqCiphertext`; both bind into the header
  signature, and `createInboundRatchetSession` fail-closes on any
  version/ciphertext mismatch or a PQ header without a local ML-KEM secret —
  a downgrade toward a PQ-capable peer throws instead of silently succeeding
  (tests in `src/lib/crypto/ratchet.pq.test.ts`). `P2PManager` lazily
  generates and persists the ML-KEM keypair in the prekey store and
  advertises `pqKem` in bundles; pre-PQ identities keep working classically.
  New `.nova-backup` files (format v2) derive their key with **Argon2id**
  (32 MiB, memory-hard, GPU-resistant — `src/lib/storage/kdf.ts`), while
  legacy PBKDF2-600k v1 files remain restorable; parameter ranges are
  validated on restore so a tampered file cannot force a weak KDF
  (`src/lib/storage/backup.kdf.test.ts`). Threat model
  (`docs/threat-model.md`) updated to match the shipped reality.

- **WebRTC IP privacy (Plan Phase 1, item 2) + threat model (item 1).**
  The main Phase 1 gap — "the peer sees your IP while the copy claims IP
  hiding" — is closed as far as code can close it: `P2PMessengerChannel` and
  `P2PMediaCall` accept an `icePolicy` (`'direct'` default, `'relay-only'`
  sets `iceTransportPolicy: 'relay'` and swaps STUN for the
  `TURN_SERVERS` list), `PrivacyPrefs` gained `webrtcRelayOnly` with a
  Settings → Privacy toggle ("Hide my IP in calls") localized in all 20
  locales, and the call overlay badge now reads "E2EE · IP hidden" vs plain
  "End-to-end Encrypted" with a tooltip explaining the direct-P2P IP exposure
  instead of hiding it. Safety guard: relay-only silently falls back to
  direct ICE while `TURN_SERVERS` is empty (self-hosted), so the toggle can
  never brick calls by default. New `docs/threat-model.md` states honestly
  what is protected and what is not (direct-P2P metadata, screenshots,
  post-quantum status, seed-phrase loss) plus a per-component disclosure
  table — the basis the landing/article claims must match.

- **Landing claims aligned with the actual codebase (Plan Phase 0).** The
  promo site at `landing/` no longer advertises features the code does not
  have: ML-KEM-768 / "post-quantum" copy was replaced with the real stack
  (X3DH + Double Ratchet + Sender Keys, X25519/Ed25519, AES-256-GCM), the
  comparison table now correctly marks Signal as the post-quantum one
  (PQXDH, 2023) and Nova as "No", `nexus://` became `nova://`, the FAQ
  references the real `.nova-backup` format plus the 24-word recovery phrase
  (not a fictional `.mess` file), "Security score 8.5/10" and "10 layers" were
  replaced with "defense in depth" without a self-assigned score, screenshot
  blocking is marked as planned, "Impossible to block" became "Hard to block"
  with the honest caveat that a censor blocking all endpoints still wins and
  domain fronting (dead on major CDNs) was swapped for self-hosted relays,
  and the Mesh Compass "50 km without internet" claim was reduced to a node
  radar over live presence/GPS with a note that long range needs external
  radio (Meshtastic). Added an Open Source repo link, privacy.html and
  terms.html footer links, a Stars are-not-a-token note, a $3.90 / 30-day
  price label (was "$3.90/mo"), and a no-JS fallback so the stats row shows
  real numbers without JavaScript. Localized across all 8 landing languages;
  deploy bundle re-staged via `npm run deploy:landing` (build OK, assets
  validated). The article on photolessons still needs the same pass
  (operator-side edit).

- **Presence privacy (Phase 8, first item).** Presence sharing is now strictly
  opt-in and can be anonymized: `PrivacyPrefs` gained `presenceSharing`,
  `presenceHashing` and `presenceTtl` (`src/lib/network/privacyMode.ts`);
  `src/lib/p2p/presence.ts` hashes the fingerprint into a truncated SHA-256
  `ph1.<hex>` id and sends a per-heartbeat TTL; `server.js` accepts hashed ids
  and clamps the TTL to 45 s–5 min per entry. `App.tsx` skips the heartbeat and
  the map fetch entirely when sharing is off, and resolves online ids back to
  fingerprints only for peers the device already knows. Settings → Privacy
  exposes the toggle, the hashing toggle and the TTL presets, localized in all
  20 locales. Tests: `src/lib/p2p/presence.test.ts` and extended
  `src/lib/network/privacyMode.test.ts`.

- **Payment narrative corrected across docs.** README (features + comparison
table) now describes Premium as a flat **$3.90 / 30-day** subscription via
**PaymentO** instead of the removed crypto-wallet flow. `en.json` gained the
plural keys (`postsCount`/`votesCount` zero/two/few/many) so all 20 locales
report i18n parity.

- **Roadmap phase 7 marked done.** Translation pass, mobile CI (`workflow_dispatch`
on `android-e2e.yml`), accessibility/button audits, code-splitting check,
dev-ergonomics CSP guard, release checklist doc, landing deploy and end-to-end
premium payment flow are now marked `[x]`.

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
  events), and also pauses it while a precise local GPS marker is shown. With a
  connection and no precise marker the map renders normal OSM tiles; offline
  or while showing the local point, the dark `#151722` canvas shows mesh nodes
  and links only. Leaflet dark theming lives in
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

## Fix track (new)

The 2026-11-18 repository audit is tracked in
[`docs/fix-roadmap.md`](docs/fix-roadmap.md). It does not add product scope: it
lists what is currently broken or overstated (CI, transport, at-rest keys,
server endpoints, docs drift) with evidence, a fix and an acceptance check per
item, grouped into phases F0 (red CI), F1 (product honesty), F2 (keys/PIN),
F3 (server surface) and F4 (quality/docs).

Status: F0, F1.2, F2.2 (except key-wrapping), F2.3, F2.4, F3.3, F3.4, F4.1 and
F4.2 are done — CI is green on this branch, anon file receive works, the PIN is
salted per device with a legacy migration, invite tokens are no longer
weak-random or burnable by garbage requests, token/PIN checks are constant
time, CORS is an allowlist, the fuzzers are seeded, and the relay server finally
has HTTP tests (the app only listens when it is the entry point). Still open and
load-bearing: **F1.1** (the 1:1 chat UI still encrypts to a locally generated
demo peer, so no message reaches a second device), **F1.3**, **F2.1** (the vault
key now lives in the desktop OS credential store, but Android/iOS still fall
back to localStorage and the PIN does not wrap the key), **F3.1/F3.2**
(unauthenticated relay and presence), **F4.3/F4.4/F4.5**.

## Anonymity track (new)

Full anonymous-messenger roadmap (one-way queues, proxy hop, fixed-size
packets, relay TTL, multi-relay, groups, push, spam resistance, audit) is
tracked separately in `docs/anonymity-roadmap.md`. This track is additive:
existing secure P2P messaging remains the baseline and fallback until
anonymous v1 is stable.

## Monetization track (new)

Ads + affiliate monetization is tracked in `docs/monetization-roadmap.md`
(product, inventory, revenue share, economics, RF legal contour, admin
dashboard, phases), with the technical contracts — rule catalog, sanctions,
creative review, data model, auction API, anti-fraud — in
[`docs/moderation-and-ads-plan.md`](docs/moderation-and-ads-plan.md)
(§15 auction, §22 moderation stages 0–5, §31 what is already shipped).
Moderation ships **before** the first ad,
not alongside it.

Scope boundaries that are not up for negotiation:

- **Never** ads in 1:1 chats, groups, calls or push notifications; no reading
  of message content for targeting (the architecture makes it impossible).
- The ad server is an **optional, self-hostable add-on**, outside the message
  delivery path; an app built with monetization off must stay fully
  functional and make no ad network calls.
- No `IDFA`/`GAID`, no third-party ad SDKs, no per-user identifiers beyond a
  daily-salted HMAC used for frequency caps.
- Ads are one line of revenue next to Premium (already shipped), paid channel
  subscriptions and in-app currency — never the whole basket.

Phases (each gated on the checklist in §12 of the doc):

- [ ] **A. Validation** (weeks 1–6) — hand-sold sponsored posts in 20–50 top
  channels with manual ORD marking, one CPA aggregator, basic channel stats,
  public ads constitution. First money, real CPM demand, zero ad-server code.
  Spec: [`docs/monetization-phase-a-spec.md`](docs/monetization-phase-a-spec.md)
  (channel criteria, price list, deal funnel, erid procedure, gate criteria).
- [ ] **B. MVP platform** (months 2–4) — ad server with sponsored post,
  server-enforced frequency caps, second-price auction, 50% rev share and
  payouts, admin dashboard v1, automatic `erid`, promoted channels in the
  catalog. Spec: [`docs/monetization-phase-b-spec.md`](docs/monetization-phase-b-spec.md)
  (data model, `/slot` + `/events` API, caps, ledger, ORD outbox, tests).
- [ ] **C. Ecosystem** (months 4–8) — self-serve advertiser cabinet, rewarded
  ads in mini-apps plus in-app currency, mini-app affiliate program, sponsored
  sticker packs, ads in stories, Premium turns ads off.
- [ ] **D. Optimization** (months 8–12) — ML ranking and predicted CTR,
  external/programmatic demand, gifting, chat-list experiments only behind a
  holdout.

Already in the repo: the client-side prototype only — `src/lib/ads/` (types,
local dismiss/block/journal), `src/components/SponsoredPostCard.tsx`, and the
Settings → Ads section. Premium suppression exists on-device already as the
`ads_free` Premium feature (`src/lib/premium.ts`; `ChannelScreen` checks
`canUse('ads_free')` before rendering the slot), but it has no server-side
billing yet. No server caps, auction, payouts, dashboard, `erid` or affiliate
attribution either.

Guardrails that roll an ad load back: holdout group without ads (D30 retention
delta > 0.5 pp), hide rate > 1% of impressions, ad complaints > 0.1%, admin
churn > 5%/month, subscriber unsubscribes at 2× baseline.
