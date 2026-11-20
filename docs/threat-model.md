# Threat model & metadata disclosure

What the app protects against, and — more importantly — what it does **not**.

Checked: 2026-11-18. This document must stay in sync with the UI copy; any
marketing claim should be traceable to a line here.

## Protected against

| Adversary | Protection |
|---|---|
| Passive network observer between you and your peer | E2EE: hybrid X3DH (X25519 **+ ML-KEM-768**) + Double Ratchet (per-message keys, forward secrecy), DTLS-SRTP media |
| Quantum "harvest now, decrypt later" | Handshake binds an ML-KEM-768 shared secret into the root key: recorded ciphertexts stay safe if *either* X25519 or ML-KEM-768 holds. Fail-closed negotiation rejects classical-only headers toward PQ-capable peers |
| Compromise of the signaling/relay server | Server only transports opaque encrypted envelopes; content is undecryptable |
| Device thief (with PIN) | PIN lock with backoff 30 s → 15 min; local storage encrypted (AES-256-GCM, PBKDF2 600k) |
| Offline attack on stolen backups | `.nova-backup` v2 keys derive via **Argon2id** (32 MiB, memory-hard); PBKDF2-600k still accepted for legacy v1 files |
| Malicious relay learning who talks to whom | Presence is opt-in, hashed (`ph1.<hex>`), TTL-clamped (see `presence-privacy.md`); relay destinations are opaque fingerprints |
| Impersonation / key substitution | Safety numbers + QR verification, sealed sender |

## Not protected (honest limits)

- **Direct P2P reveals your IP to your peer.** WebRTC peer-to-peer media needs
  your address. Mitigation: Settings → Privacy → *Hide my IP in calls* routes
  media through a TURN relay (`iceTransportPolicy: 'relay'`), but that requires
  a self-hosted TURN server — the bundled config has none, and without it the
  relay-only call cannot connect. The call overlay shows "IP hidden" vs plain
  "End-to-end Encrypted" accordingly.
- **Metadata during direct P2P:** timing, size and frequency of packets between
  two peers. Opt-in metadata minimization adds padding, jitter and cover
  traffic, which raises the cost of traffic analysis without eliminating it.
- **Compromised device** (malware, unlocked screen): nothing in the app helps.
- **Screenshots in normal chats:** planned for secret chats, not yet shipped —
  the landing copy was corrected to say "planned".
- **Push notifications:** none in ordinary chats by design (no FCM/APNs), so
  delivery when the app is closed depends on the relay store-and-forward window.
  Anonymous mode has optional token-only push hints; Apple/Google or a
  UnifiedPush distributor still learn that some device was woken.
- **Loss of the seed phrase:** no recovery. That is the price of no central
  identity provider.
- **ICE candidate privacy in signaling:** the signaling server sees your ICE
  candidates (IPs) even in relay-only mode (they are TURN addresses).
  Candidate filtering beyond relay-only (e.g. mDNS candidates in browsers) is
  browser-controlled, not app-controlled.
- **Post-quantum:** hybrid ML-KEM-768 is shipped **in the 1:1 handshake**
  (`src/lib/crypto/postQuantum.ts`, negotiated as protocol version 3 with
  downgrade protection). Group chats still use classical Sender Keys; PQ
  ratcheting (periodic PQ re-encapsulation) is on the roadmap.
- **Push notifications:** none in ordinary chats by design (no FCM/APNs), so
  delivery when the app is closed depends on the relay store-and-forward window.
  Anonymous mode has optional token-only push hints; Apple/Google or a
  UnifiedPush distributor still learn that some device was woken.
- **Loss of the seed phrase:** no recovery. That is the price of no central
  identity provider.

## What each infrastructure component sees

| Component | Sees | Never sees |
|---|---|---|
| Signaling (SDP/ICE exchange) | both fingerprints, IPs of candidates, timing | message content, media |
| TURN relay (if enabled) | encrypted media stream, both IPs | media content (DTLS-SRTP) |
| HTTP relay store-and-forward | opaque ciphertext blob, destination fingerprint, TTL | content, sender key, identity |
| PaymentO | payment metadata the store collects | identity keys (device id only) |
| Mesh map presence (opt-in) | hashed id `ph1.<hex>`, TTL window | raw fingerprint, any content |

## Bots (L1 local, L2/L3 gateway)

Bots are not a trusted part of the client. The default is deny, and the user
grants each permission explicitly at install time; a manifest update that asks
for more permissions requires re-consent (`pendingConsent` in
`src/lib/bots/runtime.ts`).

| Threat | Mitigation |
|---|---|
| Malicious bot reading chats it was not granted | `BotContext` checks `read_messages` / `send_messages` / `edit` / `delete` / `inline_keyboard` / `media` on every call; no ambient filesystem, network or identity access |
| Bot flooding a chat | Runtime rate limit (~20 messages/s per bot) plus the gateway's per-chat limit (~1/s) |
| Bot spamming a group | `mention_only` privacy mode: only commands, mentions and callbacks are delivered unless the user granted more |
| Phishing through inline buttons | The component shows the button text and the resolved action (`callback_data`, URL or Mini App) on long-press before dispatch |
| Blocked bot still replying | `InstalledBot.blocked` is persisted in the encrypted registry and checked before every update/callback; the UI offers Unblock explicitly |
| Gateway owner reading messages | L2/L3 is E2EE with the bot's own key, but the gateway holds that key — the owner can read chats with the bot. The client must not label gateway bots as more private than they are |
| Bot token leak (L3) | Gateway stores only a hash of its token and shows it once; the core app never embeds key material in a token |
| SSRF through `webhook_url` | https only, private/loopback/link-local ranges denied, re-validated after DNS resolution and redirects |
| Webhook forgery/replay | HMAC-SHA256 signature, timestamp window, replay guard |
| Fake "verified" badge | Not implemented; there is no verified tier yet and the UI must not imply one |
| Report data leaving the device | Reports are local-only (`src/lib/bots/reports.ts`): bot id, reason, timestamp; no message text and no network request |

Residual limits: a local L1 bot runs in the app's origin, so a bug in the bot
module is a bug in the app (the sandbox is the permission-checked context, not
a separate process); L2/L3 availability depends on the owner's gateway. Treat a
third-party bot as untrusted code and review its manifest before granting
`read_messages`.

## Anonymous queue layer (experimental)

| Component | Sees | Never sees |
|---|---|---|
| Anon relay | queue id, hashed tokens, Ed25519 command signatures, fixed-size ciphertext, sizes/timing, TTL, ACK state | sender identity, message content, group membership, raw tokens |
| Anon proxy hop | sender IP, destination relay id, sealed envelope | queue id, tokens, packet content |
| Tor entry/exit | the relay's `.onion` address, circuit timing | plaintext (onion + sealed payload are layered) |
| Push bridge (if configured) | provider token and an empty wake-up | queue id, sender, content |
| Relay storage | queue records and fixed packets in RAM only (reports are hash-only files) | accounts, contact graph, plaintext |

Not protected: timing correlation by a relay/proxy, IP exposure in direct
(non-proxy, non-Tor) mode, relay restarts losing queued data, an invite holder
signing commands for its queue (sealed sender gives confidentiality, not sender
authentication), and clients/devices compromised by malware. See
`docs/anonymity-audit.md` for severity-tagged findings and the test matrix.
