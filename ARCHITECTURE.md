# Nova Dark Messenger — Architecture

## Overview
Client-first secure messaging application built with React 19, TypeScript, Vite, and Tailwind CSS. Designed for mobile (Android/iOS via Tauri v2) and desktop. No server-side dependencies for core messaging; local-first encrypted storage.

## Stack
- **UI**: React 19 + TypeScript + Tailwind CSS 4 + lucide-react + framer-motion
- **Build**: Vite 8 + Vitest 5 + ESLint
- **Crypto**: @noble/curves (X25519, Ed25519), @noble/hashes (SHA-256, HKDF, HMAC), @scure/bip39 (mnemonic), Web Crypto API (AES-256-GCM, PBKDF2)
- **Storage**: IndexedDB (encrypted via AES-256-GCM + PBKDF2), localStorage (settings/PIN hash)
- **i18n**: i18next + react-i18next (en, ru, uk)
- **P2P**: WebRTC DataChannel + audio/video media tracks (simulated call fallback), BroadcastChannel (local testing), WebSocket signaling client
- **Mobile**: Tauri v2 (planned for Android/iOS)

## Directory Layout
```
src/
  App.tsx            — Shell: desktop rail + mobile pane, screen router
  main.tsx           — React root with LanguageProvider + SecurityProvider
  i18n.ts            — i18next configuration
  index.css          — Tailwind + design tokens
  components/        — UI screens and modals
    ChatsScreen.tsx  — Chat list, folders, stories, bottom nav
    ChatScreen.tsx   — Individual chat view with E2EE
    SettingsModal.tsx — Security, backup, 2FA, PIN, seed phrase, appearance
    ProfileScreen.tsx — Contact profile
    ChannelScreen.tsx — Channel feed
    AnalyticsScreen.tsx — Local-only usage analytics
    ...modals
  context/           — React context providers
    LanguageContext.tsx — i18n
    SecurityContext.tsx — Identity, E2EE sessions, PIN, 2FA, backup
  hooks/
    useSecurity.ts   — SecurityContext wrapper
    usePremium.ts    — Feature gating
    useAnalytics.ts  — Local analytics tracker
  lib/
    crypto/
      identity.ts    — X25519/Ed25519 identity from BIP-39 mnemonic, prekeys, X3DH bundles
      ratchet.ts     — Double Ratchet: X3DH handshake + symmetric ratchet, AES-256-GCM
      aes.ts         — AES-256-GCM, PBKDF2 key derivation, base64/hex utilities
    p2p/
      signaling.ts   — WebSocket + BroadcastChannel signaling, PoW challenge
      p2pManager.ts  — Peer connection management
      webrtc.ts      — WebRTC DataChannel wrapper (+ local/remote media tracks)
      mediaCall.ts   — Voice/video call session (getUserMedia, mute/camera, state)
      relay.ts       — Relay proxy client
      totp.ts        — TOTP (RFC 6238) generation and verification
    storage/
      db.ts          — Encrypted IndexedDB (messages, sessions, prekeys, settings)
      kdf.ts         — PBKDF2 / HKDF key derivation
      backup.ts      — Encrypted .nova-backup export/import
      identityStore.ts — Persisted identity (localStorage)
    security/
      sanitize.ts    — HTML escaping and sanitization (XSS prevention)
    analytics/
      localAnalytics.ts — Client-only event tracking (no network)
  types/
    messenger.ts     — TypeScript interfaces (ChatItem, Message, etc.)
  data/
    mockMessengerData.ts — Mock chats/messages for development
    wallpapers.ts    — Wallpaper definitions
  locales/
    en.json, ru.json, uk.json — i18n strings
  test/              — Vitest unit tests
```

## Cryptography

### Identity
- BIP-39 mnemonic (12/24 words) → seed → HKDF → X25519 secret (encryption) + Ed25519 secret (signing)
- Fingerprint = `nova_pk_<sha256(signing_public_key)[:16]>`
- Stored encrypted in IndexedDB; backed by `.nova-backup` export

### Session Establishment (X3DH)
- Initiator fetches recipient's PreKeyBundle (identity key, signed prekey, optional one-time prekey)
- 3-4 DH exchanges combined via HKDF → shared secret
- Signed prekey verified against Ed25519 signing key

### Double Ratchet
- Root key + chain keys derived via HKDF
- Each message: chain key → message key (HMAC) + next chain key
- DH ratchet rotates on new ephemeral public key
- Skipped message keys buffer (max 1000)

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
- Local-only analytics (no network)
