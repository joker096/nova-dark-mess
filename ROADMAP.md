# Nova Dark Messenger — Roadmap

Last updated: 2026-11-12

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
audio/video calls with signaling fallback, Tauri mobile builds (in progress).

## Comparison: Telegram / WhatsApp vs Nova Dark Messenger

Legend: ✅ shipped · 🟡 partial · ❌ missing · ➖ out of scope (violates constraints)

| Area | Telegram | WhatsApp | Nova Dark | Notes |
|---|---|---|---|---|
| Registration | phone number | phone number | cryptographic identity (mnemonic) | Nova requires no PII |
| Contact discovery | phone book / username | phone book | QR code / fingerprint / invite link | No server-side lookup |
| 1:1 messaging | ✅ cloud | ✅ E2EE | ✅ E2EE | Nova is E2EE by default |
| Group chats | ✅ up to 200k | ✅ up to 1024 | ❌ missing | P2P group ratchet needed |
| Channels / broadcast | ✅ | ✅ (Channels) | ✅ (channels + posts) | Already shipped |
| Stories / status | ✅ | ✅ (Status) | ✅ (stories) | Already shipped |
| Reactions | ✅ | ✅ | ✅ | |
| Replies / threads | ✅ | ✅ | ✅ (reply) | Full threads missing |
| Polls | ✅ | ✅ | ✅ | Just shipped |
| Stickers | ✅ (packs, animated) | ✅ | ✅ (static packs) | Animated/video stickers missing |
| Location (live) | ✅ | ✅ | ✅ (static + live GPS) | |
| Voice messages | ✅ | ✅ | ✅ | |
| Voice / video calls | ✅ | ✅ | 🟡 WebRTC media wired | Audio/video UI, mute/camera, history; simulated fallback until peer fingerprint is available |
| File sharing | ✅ (up to 2 GB) | ✅ (up to 2 GB) | ❌ missing | P2P chunked transfer needed |
| Message edit / delete | ✅ | ✅ (delete for everyone) | ❌ missing | |
| Disappearing messages | ✅ (secret chats) | ✅ (view once, timer) | ❌ missing | |
| Read receipts / typing | ✅ | ✅ | 🟡 local only | Need P2P delivery receipts |
| Multi-device | ✅ (cloud) | ✅ (phone primary) | 🟡 single device | Device linking via QR |
| Cloud backup | ✅ | ✅ (Google/Apple) | ✅ (encrypted file export) | No cloud by design |
| Search (global) | ✅ | ✅ | 🟡 local chat search | |
| Folders / labels | ✅ | ❌ | ✅ | |
| Scheduled messages | ✅ | ❌ | ✅ | |
| Bots / API | ✅ | ✅ (Business API) | ➖ out of scope | No centralized bot platform |
| Payments | ❌ (P2P crypto) | ✅ | ➖ out of scope | Not a payments app |
| Usernames | ✅ | ❌ | 🟡 fingerprint only | Human-readable handles without server |
| Premium tier | ✅ | ✅ (Meta Verified) | 🟡 `usePremium` gating | |

## Roadmap

### Phase 0 — Finish in-flight (1–2 sprints)

- Merge PR #1 (polls/stickers/location in chats & channels) and the pluralization follow-up.
- ✅ Wire media calls (voice/video) into `ChatScreen` using the existing WebRTC layer: real
  local/remote streams, mute/camera toggles, voice-call button and call history in chat
  (`src/lib/p2p/mediaCall.ts`); simulated fallback keeps the demo usable without a peer.
- Ship animated/video stickers and a sticker-pack import (local file), keeping packs on-device.
- Add message edit & delete (for everyone / for me) with tombstone markers and ratchet re-keying.

### Phase 1 — Core messaging parity (P2P) (2–3 sprints)

- **Group chats (small, ≤ 50 members)** via Sender Keys + pairwise ratchets; group metadata stored locally and synced P2P. No server-side group state.
- **File sharing** over WebRTC DataChannel with chunking, resume, and SHA-256 integrity; size cap configurable (default 100 MB to stay device-friendly).
- **Disappearing messages & view-once media** with local timers and secure deletion of ciphertext + keys.
- **Delivery & read receipts + typing indicators** as ephemeral P2P signals (no persistence).
- **Message threads / replies view** and pinned messages per chat.
- **Global search** across chats, channels and media (local index, no server).

### Phase 2 — Multi-device & identity (2 sprints)

- **Device linking** via QR code + X3DH, so a second device can decrypt new messages; old history synced encrypted over the local network or a user-chosen relay.
- **Human-readable handles** derived from the public key (e.g. `nova://<short-id>`) plus optional self-asserted display name; no central registry.
- **Encrypted cloud backup (opt-in)** to a user-selected WebDAV/S3-compatible endpoint, keys never leave the device.
- **Offline message queue** with store-and-forward through a user-chosen (or default public) stateless relay that only sees ciphertext.

### Phase 3 — Channels & communities (1–2 sprints)

- **Channel admin tools**: scheduled posts (already), edit/delete, reactions, comments, subscriber count privacy (hide exact count).
- **Communities**: a channel + linked discussion group, moderated locally by admins.
- **Live location sharing in groups** with expiry and geofencing (already in 1:1).
- **Broadcast lists** (WhatsApp-style) implemented as fan-out over P2P connections.

### Phase 4 — Hardening & UX polish (ongoing)

- **Metadata minimization**: padding, cover traffic, randomized message timing to resist traffic analysis (opt-in, battery-aware).
- **Sealed sender** for 1:1 messages where feasible.
- **Safety numbers / key verification** UI with QR and emoji fingerprints.
- **Accessibility & i18n**: finish the remaining 7 locales (de, es, tr, id, vi, ar, th) beyond the channel/chat core strings; RTL audit for ar.
- **Performance**: virtualized message lists, lazy media loading, bundle splitting.
- **Desktop & mobile parity**: Tauri v2 release builds, deep links for invite URLs, OS keychain integration for the master key.

## Explicitly out of scope

- Phone-number or email registration and server-side contact discovery.
- Centralized cloud storage of plaintext or ciphertext messages.
- Push notifications via third-party services (FCM/APNs) — replaced by in-app polling over P2P or user-opt-in self-hosted gateways.
- A bot/API platform requiring a central server (a local webhook/plugin model may be explored later).
- Payments, crypto wallets, or in-app purchases.

## Success metrics

- A new user can register, add a contact and exchange an encrypted message with **zero network requests** in the default configuration.
- Group chat of 10 members works over LAN with no signaling server.
- No PII is present in any persisted storage key or network payload (audited via `tests/` + manual review).
- All user-facing strings pass i18n parity tests (`src/lib/i18n.test.ts`).
