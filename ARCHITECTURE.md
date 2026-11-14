# Nova Dark Messenger — Architecture

## Overview
Client-first secure messaging application built with React 19, TypeScript, Vite, and Tailwind CSS. Designed for mobile (Android/iOS via Tauri v2) and desktop. No server-side dependencies for core messaging; local-first encrypted storage.

## Stack
- **UI**: React 19 + TypeScript + Tailwind CSS 4 + lucide-react + framer-motion
- **Build**: Vite 8 + Vitest 5 + ESLint
- **Crypto**: @noble/curves (X25519, Ed25519), @noble/hashes (SHA-256, HKDF, HMAC), @scure/bip39 (mnemonic), Web Crypto API (AES-256-GCM, PBKDF2)
- **Storage**: IndexedDB (encrypted via AES-256-GCM + PBKDF2), localStorage (settings/PIN hash)
- **i18n**: i18next + react-i18next — **10 locales**: `en`, `ru`, `uk`, `de`, `es`, `tr`, `id`, `vi`, `ar`, `th`
- **P2P**: WebRTC DataChannel + audio/video media tracks (simulated call fallback), BroadcastChannel (local testing), WebSocket signaling client
- **Mobile**: Tauri v2 — `productName: "Nova Dark Messenger"`

## Directory Layout
```
src/
  App.tsx                   — Shell: desktop rail + mobile pane, screen router
  main.tsx                  — React root with LanguageProvider + SecurityProvider
  i18n.ts                   — i18next configuration (10 locales)
  index.css                 — Tailwind + design tokens
  components/               — UI screens and modals
    ChatsScreen.tsx         — Chat list, folders, stories, communities, bottom nav
    ChatScreen.tsx          — Individual chat with E2EE, groups, file transfer, receipts
    SettingsModal.tsx       — Security, backup, 2FA, PIN, seed phrase, appearance, premium
    ProfileScreen.tsx       — Contact profile, device linking, QR scanner, history sync
    ChannelScreen.tsx       — Channel feed (broadcast, admin tools)
    AnalyticsScreen.tsx     — Local-only usage analytics
    CommunitiesPanel.tsx    — Communities sidebar + room list
    VirtualizedList.tsx     — Windowed list renderer for large message sets
    LazyMedia.tsx           — Intersection-Observer lazy image/video loader
    chat/
      PinnedMessagesCarousel.tsx — Pinned message strip with accessible pagination
      ThreadView.tsx        — Threaded reply dialog
      MediaGallery.tsx      — Full-screen media viewer
      ReactionPicker.tsx    — Emoji reaction overlay
      PollBlock.tsx         — Poll render + vote handler
      StickerPicker.tsx     — Animated sticker panel
    ...modals
  context/
    LanguageContext.tsx     — i18n provider + locale detection
    SecurityContext.tsx     — Identity, E2EE sessions, PIN, 2FA, backup
  hooks/
    useSecurity.ts          — SecurityContext wrapper
    usePremium.ts           — Feature gating (canUse / checkout)
    useAnalytics.ts         — Local analytics tracker
    useAccount.ts           — Persistent local account profile (localStorage)
  lib/
    crypto/
      identity.ts           — X25519/Ed25519 identity from BIP-39 mnemonic, prekeys, X3DH bundles
      ratchet.ts            — Double Ratchet: X3DH handshake + symmetric ratchet, AES-256-GCM
      aes.ts                — AES-256-GCM, PBKDF2 key derivation, base64/hex utilities
      senderKeys.ts         — Signal Sender Key protocol for group encryption
      handles.ts            — Human-readable handle generation (@nova-xxxx) + validation
      safetyNumbers.ts      — Safety number computation + verification ceremony
    p2p/
      signaling.ts          — WebSocket + BroadcastChannel signaling, PoW challenge
      p2pManager.ts         — Peer connection management
      webrtc.ts             — WebRTC DataChannel wrapper (+ local/remote media tracks)
      mediaCall.ts          — Voice/video call session (getUserMedia, mute/camera, state machine)
      groupManager.ts       — GroupChatManager: Sender Key distribution, fan-out send
      fileTransfer.ts       — FileTransferManager: chunked P2P transfer, SHA-256 integrity
      receipts.ts           — ReceiptManager: delivery/read receipts, typing signals
      deviceLinking.ts      — DeviceLinkManager: X25519 pairing, QR code, history snapshot export/import
      liveLocation.ts       — LiveLocationManager: real-time GPS fan-out for 1:1 and groups
      broadcastManager.ts   — BroadcastManager: one-to-many channel fan-out
      relay.ts              — Relay proxy client
      totp.ts               — TOTP (RFC 6238) generation and verification
    storage/
      db.ts                 — Encrypted IndexedDB (messages, sessions, prekeys, settings)
      kdf.ts                — PBKDF2 / HKDF key derivation
      backup.ts             — Encrypted .nova-backup export/import
      identityStore.ts      — Persisted identity (localStorage)
      cloudBackup.ts        — Optional encrypted cloud backup (export/import blob)
      keychain.ts           — OS keychain bridge (Tauri secure storage)
    network/
      metadataMinimization.ts — Strip IP metadata, dummy traffic injection
      privacyMode.ts        — Privacy-mode toggle (sealed sender enforced, no read receipts)
      offlineQueue.ts       — Persist outbound messages while offline, replay on reconnect
      offlineRelay.ts       — Store-and-forward relay for async delivery
      deepLinks.ts          — nova:// deep link parser + router
    messaging/
      messageLifecycle.ts   — editMessage / deleteMessage with ratchet re-keying
      sealedSender.ts       — Sealed sender envelope: strip sender identity from ciphertext header
      threads.ts            — getThreadMessages: thread view pagination
      secureWipe.ts         — secureWipeMessage: timer-based disappearing messages
    search/
      globalSearch.ts       — Full-text search across all local conversations
    account/
      accountProfile.ts     — Local account: displayName, avatar, status (localStorage)
      channelVisibility.ts  — Private/public channel membership filter
    security/
      sanitize.ts           — HTML escaping and sanitization (XSS prevention)
    analytics/
      localAnalytics.ts     — Client-only event tracking (no network)
    ui/
      NovaToggle.tsx        — Accessible toggle switch (role=switch + aria-label)
      NovaButton.tsx        — Design-system button
      NovaInput.tsx         — Design-system input
      NovaBadge.tsx         — Notification badge
  types/
    messenger.ts            — TypeScript interfaces (ChatItem, Message, members?, etc.)
  data/
    mockMessengerData.ts    — Mock chats/messages for development
    wallpapers.ts           — Wallpaper definitions
  locales/
    en.json  ru.json  uk.json  de.json  es.json
    tr.json  id.json  vi.json  ar.json  th.json
  test/                     — Vitest unit tests
scripts/
  audit-buttons.ts          — Accessibility audit: every <button> must have aria-label or title
  audit-i18n.ts             — i18n audit: every t() key must exist in all 10 locale files
```

## Cryptography

### Identity
- BIP-39 mnemonic (12/24 words) → seed → HKDF → X25519 secret (encryption) + Ed25519 secret (signing)
- Fingerprint = `nova_pk_<sha256(signing_public_key)[:16]>`
- Stored encrypted in IndexedDB; backed by `.nova-backup` export
- Safety numbers: SHA-256(fingerprint_A ‖ fingerprint_B) displayed as 60-digit numeric string

### Session Establishment (X3DH)
- Initiator fetches recipient's PreKeyBundle (identity key, signed prekey, optional one-time prekey)
- 3-4 DH exchanges combined via HKDF → shared secret
- Signed prekey verified against Ed25519 signing key

### Double Ratchet
- Root key + chain keys derived via HKDF
- Each message: chain key → message key (HMAC) + next chain key
- DH ratchet rotates on new ephemeral public key
- Skipped message keys buffer (max 1000)

### Group Messaging (Sender Keys)
- Group creator generates a Sender Key (32-byte random + chain key)
- Sender Key distributed to each member via individual X3DH-encrypted pairwise sessions
- Messages encrypted once with Sender Key; each recipient decrypts with their copy
- Key rotation on member removal

### Sealed Sender
- Outgoing envelope strips sender fingerprint from the plaintext header
- Recipient authenticates sender via MAC inside the ciphertext only
- Prevents metadata leakage to relay/signaling layer

### Device Linking
- Two-device pairing via X25519 ephemeral key exchange over QR code / copy-paste
- Linked device receives encrypted history snapshot (AES-256-GCM, HKDF-derived link key)
- Camera QR scanner using `getUserMedia({ video: { facingMode: 'environment' } })`

### Message Format
```
RatchetMessagePayload {
  version: 2,
  senderFingerprint, recipientFingerprint,
  sequenceNumber, previousChainLength,
  ephemeralPublicKey,
  encryptedContent: { ciphertext, iv, salt? },
  timestamp,
  x3dh?: X3DHHeader  // only on first message
}
```

## Local Storage
- IndexedDB `NovaDarkMessengerDB` v2
- Stores: encrypted_messages, ratchet_sessions, prekey_store, security_settings
- All records encrypted with AES-256-GCM using master key from PBKDF2(passphrase, salt)
- Master key derived from device-secret stored in localStorage

## Security Features
- PIN lock (PBKDF2 hash, localStorage)
- TOTP 2FA (RFC 6238, SHA-1, 6-digit, 30s period)
- Encrypted backup (.nova-backup, PBKDF2 + AES-256-GCM)
- Seed phrase recovery (BIP-39 mnemonic)
- XSS sanitization (escapeHtml, safe tag allowlist)
- Sealed sender (no sender metadata in ciphertext header)
- Safety numbers (fingerprint verification ceremony)
- Metadata minimization (strip IP, dummy traffic)
- Disappearing messages (5 / 10 / 30 / 60 s; view-once mode)
- Secure wipe (message overwritten before removal)
- Local-only analytics (no network egress)
- OS keychain integration via Tauri secure storage

## P2P Features
- WebRTC DataChannel for all messaging (text, files, receipts, typing)
- Chunked file transfer with SHA-256 integrity verification
- Voice / video calls: `getUserMedia`, mute, camera toggle, state machine
- Delivery receipts (sent → delivered → read), typing indicators
- Live location sharing (GPS fan-out, group support)
- Offline queue: persists outbound messages, replays on reconnect
- Store-and-forward relay for async delivery when peers are offline

## Accessibility
- Every `<button>` must have `aria-label` or `title` (enforced by `scripts/audit-buttons.ts`)
- `NovaToggle` uses `role="switch"` + `aria-checked` + `aria-label`
- Pagination dots in `PinnedMessagesCarousel` have both `title` and `aria-label`
- VirtualizedList uses `role="list"` / `role="listitem"` landmarks
