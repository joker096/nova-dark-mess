# Nova Dark Messenger — Anonymity Roadmap

Last updated: 2026-11-18

This roadmap turns the proposed anonymous-messenger architecture into an
implementable plan. It is intentionally incremental: each phase must ship
with tests and must not break the existing secure-messaging baseline.

**Implementation status:** see §2.1. The phases below are the target, not a
description of what is finished.

## 0. Scope and non-goals

Goal: make it so that neither a relay nor a passive network observer can
learn who talks to whom, when users are online, or message sizes — while
keeping the project’s core constraints:

- no phone/email/PII registration;
- no message content or identity stored by relays;
- local-first encrypted storage;
- open, auditable cryptography.

Non-goals for the first iterations:

- hiding metadata from a global active adversary that controls both proxy
  and destination relay;
- full anonymity against a compromised endpoint device;
- hiding the fact that a push notification was delivered (Apple/Google see it).

## 1. Baseline: what already exists

- E2EE 1:1: X3DH + Double Ratchet (`src/lib/crypto/ratchet.ts`).
- Hybrid post-quantum X3DH: ML-KEM-768 (`src/lib/crypto/postQuantum.ts`).
- Sealed sender (`src/lib/messaging/sealedSender.ts`).
- Optional padding/cover traffic/jitter (`src/lib/network/metadataMinimization.ts`).
- P2P mesh relay with TTL/dedup (`src/lib/p2p/relay.ts`).
- Offline queue + store-and-forward (`src/lib/network/offlineQueue.ts`, `offlineRelay.ts`).
- Sender Keys groups (`src/lib/crypto/senderKeys.ts`, `src/lib/p2p/groupManager.ts`).
- Opt-in presence hashing (`docs/presence-privacy.md`).

## 2. Target architecture (summary)

```text
Alice                                                Bob
  | (Bob->Alice queue on relay R1)   (Alice->Bob queue on relay R2)
  |                                                          |
  |-- sealed E2EE --> proxy P --> R2 (Bob's queue) <-- poll -|
  |   proxy knows Alice IP, not recipient/content            |
  |                                                          |
  <- poll -- R1 (Alice's queue) <-- proxy P' <-- sealed E2EE-|
```

Key rules:

1. No global account ID. One invite creates one contact and one pair of
   one-way queues with separate keys.
2. Each queue has separate sender-side and recipient-side IDs.
3. Relay commands are signed by the queue key, not by an account.
4. Fixed-size padded packets for messages, receipts and control commands.
5. Relay stores ciphertext only until ACK or TTL, then deletes it.
6. Proxy hides sender IP from destination relay.
7. Recipient polls through proxy or Tor.
8. Optional dummy traffic and jitter.

## 2.1 Implementation status (2026-11-16; proxy hop + pairing updated 2026-11-17)

The repository contains an evolving v1 implementation under `src/lib/anon/`
plus server endpoints in `server.js`. Protocol mechanics are covered by unit
tests; the experimental app surface remains isolated from ordinary chats and
does not meet full Phase B/C acceptance.

| Area | Current state | Blocker / missing |
|---|---|---|
| Packet framing | `src/lib/anon/packet.ts` implements 4/16/64 KiB profiles with random padding and fixed-profile file chunk/reassembly helpers; tests cover packet sizes and malformed chunks, and `vectors.test.ts` pins golden queue-id/token, packet-hash and file-chunk vectors. | File transfer is not wired into the app. |
| IDs and tokens | `src/lib/anon/ids.ts` generates 16-byte queue IDs and 32-byte tokens; `pairing.ts` creates independent inbox queues; every queue carries a one-time invite token burned by the relay on first enqueue. | Invite token is transmitted inside the invite blob (secret, not hashed at rest on the client). |
| Relay core | `src/lib/anon/relay.ts` has in-memory queues, TTL, ACK, delete and signed-command checks. | RAM only; no HTTP integration tests. |
| Command signing | `src/lib/anon/signing.js` + `signing.d.ts` implement Ed25519 queue keys, canonical command signing, signature verification, timestamp and nonce replay checks; tests pass. | Legacy queues remain unsigned; invite holders can still sign. |
| HTTP relay | `server.js` implements direct `/api/anon/*`, sealed `/api/anon/route` (including create and hash-only report submission), and `/api/anon/hop`. | RAM only; bearer tokens plus Ed25519 command signatures; ACK/delete not rate-limited. |
| Sealed payload | `src/lib/anon/session.ts` puts sealed-sender JSON into fixed packets. | Invite `expiresAt` not enforced; no sender authentication. |
| Proxy hop | `src/lib/anon/proxy.ts` seals commands and queue creation to a pinned relay X25519 key; the proxy forwards opaque envelopes. Failover across a proxy list (`fallbackProxies`) with per-proxy failure cooldowns is implemented client-side. | Routing-key pinning is still client config; timing correlation remains. |
| Spam controls | `src/lib/anon/spam.js` + `spam.d.ts` provide PoW and one-time invite tokens (`createInviteToken`, `isInviteToken`); `server.js` verifies first-contact challenges, burns invite tokens on first enqueue, and accepts hash-only reports through sealed routing. `src/lib/anon/blocks.ts` keeps reports locally and makes uploads retryable; `pairing.ts` rejects invitations and filters offers from blocked senders. | Reports persist on the relay (one hash-only file per report id, TTL cleanup, reloaded at boot); creation is limited per signing key (10/hour) and blocked at 3 live spam reports for that key, while enqueueing on existing queues is unaffected. Report counts are unauthenticated hash-only, so blocking is a speed bump, not a ban. |
| Groups | `src/lib/anon/groups.ts` is a fan-out helper with `sendEncryptedGroupMessage` (AES-256-GCM group envelope under a shared key, one copy per member queue, capped at `MAX_FANOUT_MEMBERS`) and `distributeGroupSession` (sends the current/rotated key as a 1:1 sealed message). `src/lib/anon/groupSession.ts` adds key generation/rotation, encrypt/open, strict parsing and monotonic adoption; a removed member cannot open messages sealed after rotation. | No MLS, no dedicated group relay, no app UI/integration, and no post-compromise security/per-sender ratchet. |
| Push | `src/lib/anon/push.ts` has types, a sanitizer, `registerPush` / `fetchPushHint`, a per-queue token helper (`pushTokenForQueue`) and a hint poller (`createPushHintPoller`) that respects visibility/online state and backs off per token; `AnonymousMessengerScreen` registers one opaque token per queue and polls hints for pending and contact queues. Server endpoints `POST /api/anon/push/register` (stores only `pushToken -> queueId`) + `GET /api/anon/push/hint` (empty "check the relay") are rate-limited, TTL'd, and cleaned up; `ANON_PUSH_WEBHOOK_URL` forwards a wake-up containing only the provider token (no queue, sender or content) to a UnifiedPush/FCM/APNs bridge. | No native FCM/APNs SDK in the app and no Android background receiver, so delivery requires an operator bridge or UnifiedPush distributor and the app must poll on wake; push is disabled when a proxy is configured to avoid leaking the direct IP. |
| Multi-relay | `src/lib/anon/relays.ts` has selection/rotation helpers; `src/lib/anon/relayHealth.ts` counts consecutive transport failures per relay and `failoverInbox` moves a live queue to the next relay before its rotation window, announcing the new invite to contacts; `rotateInbox(transportFor, …)` creates the rotated queue on the *next* relay, `migrateInbox` sends the new invite to every contact over that contact's existing queue, and an invite now carries an `identityKey` (the first queue's public key) that rotation preserves, so local blocks and contact recognition survive the move. | App-triggered scheduled rotation moves due queues to the next relay on each inbox check (`rotateQueuesIfDue`, announced to contacts via `migrateInbox`); failover still covers outages. Failure counters persist to encrypted IndexedDB (`anon_relay_failures_v1`) across restart and clear on a single successful probe; a contact that misses a notice keeps writing to the old queue until it expires; `identityKey` is now bound to the queue key by an Ed25519 `identitySignature` (unsigned or forged claims fall back to the queue key), but a sender who starts a fresh inbox is still a new identity for block lists. |
| Tor/mixnet | `src/lib/anon/tor.ts` validates `.onion` endpoints and builds a fetch-compatible Tor client (`createTorFetch`) that sends requests through a loopback SOCKS5 bridge implemented in `src-tauri/src/anon_net.rs`; `createAnonTransport({ tor: true })` routes the direct and proxy transports through it, tests cover URL rules, port forwarding, failures and end-to-end queue creation, and the app has a Tor toggle that validates `.onion` relay/proxy URLs, disables push while active, and verifies the local SOCKS listener answers (`anon_tor_check`) before allowing Tor mode. Per-relay round-trip latency is recorded (`src/lib/anon/relayLatency.ts`) for the privacy/performance trade-off. | No mixnet; plain `http://` onion endpoints only (Tor authenticates and encrypts the onion circuit itself); requires the Tauri shell. |
| Fuzzing | `src/lib/anon/fuzz.test.ts` covers packet parsing; `src/lib/anon/fuzz.relay.test.ts` fuzzes relay commands, tokens, limits and signatures with a seeded PRNG, and `src/lib/anon/storage.test.ts` pins storage/TTL/ACK invariants and command timestamp/nonce binding. | No independent audit. |
| App integration | `AnonymousMessengerScreen` is reachable from the new-conversation dialog through an explicit add-contact action. It supports manually pinned proxy configuration, invite create/accept, text messaging, manual inbox checks, local blocking, battery-aware cover traffic via `DummyTrafficScheduler` (opt-in, off by default), and encrypted IndexedDB persistence of queue secrets and history. Incoming packets are persisted before ACK. Explicit abuse-report submissions send only hashes and a category inside the sealed proxy envelope. The screen explains the relay setup and invite/accept/check-inbox steps. | Experimental screen is separate from ordinary chat history; text-only, manual polling, no background sync. |
| Threat model | `docs/threat-model.md` now has an "Anonymous queue layer" section with per-component visibility and honest limits; `docs/anonymity-audit.md` records the detailed per-party table, severity-tagged findings, storage invariants and a reproducible relay-build recipe. | The audit is internal, not independent. |

Current phase status: A-B partial (protocol, fixed packets, sealed session,
relay server, client transport, transport factory, inbox pairing, Ed25519 queue
command signing, one-time invite tokens); C mostly met
(sealed routing envelope hides queue metadata and create credentials from the
proxy; proxy-list failover with cooldowns); D met (fixed framing + jitter +
battery-aware dummy traffic integrated in `AnonymousMessengerScreen`; metadata
size audit in `src/lib/anon/metadata.test.ts`); E partial (fan-out helper wired to
AnonTransport); F met (per-queue tokens, hint poller with visibility/online and
backoff, app UI registration, token-only provider webhook; no native
FCM/APNs/background receiver); G partial (rate limits + first-contact PoW verified server-side; one-time
invites, local block lists, in-app blocking, and hash-only reports through the
sealed proxy route, verified report targets, per-key creation budget); H helper
(selection/rotation plus `migrateInbox` that moves a queue to the next relay and
notifies contacts over their existing queues; relay list and per-relay transports
in the app; failure counters plus `failoverInbox` wired to polling; scheduled rotation triggered on each inbox check); I
partial (Tor endpoint selector plus a native SOCKS5 bridge and a Tor fetch client
in `createAnonTransport`; Tor-running check before enabling Tor mode; no mixnet); J partial (packet and
relay-command fuzz, storage invariants, internal metadata audit with a
reproducible build recipe and residual-risk disclosure; no independent audit).

## 3. Phase A — Protocol specification and test vectors (no UI)

Deliverables:

- `docs/anonymity-protocol.md` with exact packet format, queue commands,
  IDs, signatures, ACK, TTL and error codes.
- TypeScript types for `QueueId`, `SenderQueueToken`, `RecipientQueueToken`,
  `SealedPacket`, `RelayCommand`.
- Golden test vectors for padding, packet serialization and queue IDs.
- Threat-model update listing what each phase protects against.

Acceptance:

- Protocol document reviewed internally.
- Unit tests for serialization/padding pass.
- No app-visible behavior changes yet; the server-side `/api/anon/*` scaffold
  exists but is not wired to the client.

Status (2026-11-18): met. `src/lib/anon/vectors.test.ts` pins queue-id/token
encoding, a SHA-256 packet vector, deterministic padding offsets and profile
file chunks (the encoder accepts an injectable randomness source for vectors);
the anonymous layer is now covered in `docs/threat-model.md`.

## 4. Phase B — v1 anonymous 1:1 (single self-hosted relay)

Implement:

- Per-contact queue pair creation from an invite.
- One-way queue abstraction:
  - sender can enqueue;
  - recipient can poll/ACK/delete;
  - relay cannot link sender and recipient.
- Separate sender/recipient queue IDs.
- Queue-key (Ed25519) signed relay commands.
- Sealed sender payload inside queue packet.
- Fixed-size packet padding (recommended baseline: 16 KiB or 4 KiB profile).
- Relay storage with TTL (14-21 days max) and delete-on-ACK.
- No IP/account logs; RAM or encrypted disk only.
- Basic spam controls: queue creation limits, one-time invites, PoW on first
  contact.

Files likely touched:

- new `src/lib/anon/queue*.ts`
- new `src/lib/anon/packet*.ts`
- new `src/lib/anon/relayClient*.ts`
- server-side relay implementation (thin stateless service)
- tests under `src/lib/anon/__tests__`

Acceptance:

- Two clients can exchange messages through one relay.
- Relay DB/storage contains only queue ID, ciphertext, TTL and ACK state.
- Packet sizes are constant for text/receipt/control messages.
- Sender and recipient queue IDs are not equal and have no shared ID; timing/IP
  correlation remains outside the proxy/Tor model.
- ACK removes stored ciphertext.

Status (2026-11-18): acceptance met for the anonymous 1:1 core. Transport,
fixed packets, sealed sender, TTL, ACK, rate limits, independent inbox pairing
(`pairing.ts`), Ed25519 queue command signatures, first-contact PoW, sealed
create via proxy, and one-time invite tokens (created per queue, hashed
server-side, burned on first enqueue in both the direct and routed paths) exist.
Relay stays in RAM (allowed); reports are hash-only. Residual: direct mode still
leaks IP (use proxy/Tor), and timing/IP correlation remains outside the
proxy/Tor model.

## 5. Phase C — IP hiding (two-hop delivery)

Implement:

- Proxy relay hop between sender and destination relay.
- Sender -> proxy -> destination relay routing.
- Proxy knows sender IP but not destination queue.
- Destination relay knows queue but not sender IP.
- Recipient polling through proxy or Tor.
- Configurable proxy list and failover.
- Jitter on send/poll and randomized batching.

Acceptance:

- Destination relay logs do not contain sender IP.
- Proxy logs do not contain destination queue ID or content.
- Polling cadence has jitter and does not reveal exact message timing.

Status (2026-11-17): mostly met. Proxy commands and queue creation are sealed to a
pinned relay X25519 key, so the proxy sees only the relay id and opaque
envelopes; the relay enforces timestamp/nonce replay checks. Proxy-list failover
with consecutive-failure cooldowns is implemented in `ProxyAnonTransport` and
exposed through `createAnonTransport` (`proxy.fallbackProxies`). Not met:
the direct create endpoint remains; routing key
distribution/pinning is manual; timing correlation remains.

## 6. Phase D — Metadata hardening

Implement:

- Mandatory fixed-size framing for all relay traffic.
- Chunking for files into the same fixed block size.
- Dummy traffic mode (battery-aware, opt-in by default off).
- Cover traffic scheduler.
- Padding for receipts and control commands.
- Constant-time-ish client send scheduling where feasible.
- Metadata audit tests (packet size assertions).

Acceptance:

- All relay-bound packets have identical length within a profile.
- File chunks use the same block size.
- Dummy traffic can be enabled/disabled in settings.
- Tests assert no variable-length relay packets.

Status (2026-11-18): met. Fixed framing and packet-size tests exist;
`packet.ts` splits/reassembles file bytes into fixed-profile packets, and the
encoder pads receipt/control payloads like other payloads.
`src/lib/anon/fileTransfer.ts` adds chunk envelopes with whole-file SHA-256 and
reassembly checks (2 MB cap, 40 KiB chunks sent with the `large` profile), and
the app sends/receives files in the anonymous conversation (attachment button,
download link, encrypted-at-rest storage). Direct HTTP control bodies are padded
to fixed sizes (4 KiB control, 8 KiB ACK, profile-sized enqueue) and sealed
proxy routes are padded before encryption, with tests in
`src/lib/anon/httpRelay.test.ts`. Dummy traffic is integrated in
`AnonymousMessengerScreen` (opt-in, battery-aware via `privacyMode`, off by
default) and runs on each contact/pending-inbox queue. Metadata size audit
tests cover all three profiles for messages, receipts and control payloads in
`src/lib/anon/metadata.test.ts`. Remaining: pads are best-effort when a command
already exceeds its target, and an observer still sees request timing.

## 7. Phase E — Groups

Implement:

- Small groups (<= ~50-100): client fan-out, one copy per participant queue.
- Relay learns only separate queue writes, not group membership.
- MLS for group key management (OpenMLS/WASM or pure-JS equivalent).
- Large groups: separate per-participant queues on a group relay, no roster
  disclosure.
- Key rotation on member removal.

Acceptance:

- Group messages are delivered through per-member queues.
- Relay cannot identify group membership or size beyond traffic volume.
- Member removal rotates group keys.

Status (2026-11-18): partial. Fan-out helper `sendEncryptedGroupMessage` writes
one sealed AES-256-GCM envelope per member queue (capped at
`MAX_FANOUT_MEMBERS`); `src/lib/anon/groupSession.ts` implements group key
generation, rotation on membership change (a removed member cannot open messages
sealed after rotation), encrypt/open, strict payload parsing, and monotonic key
adoption (`adoptGroupKey` never rolls back to an older version).
`distributeGroupSession` sends the current/rotated key to each remaining member
as an ordinary personal sealed message over that member's relay, so the relay
sees only 1:1 queue writes; the receiving side classifies key distributions and
group envelopes with `parseGroupPayload`. Tests in
`src/lib/anon/groups.test.ts` and `src/lib/anon/groupSession.test.ts`.
Missing: MLS (the shared-key scheme gives no post-compromise security and no
per-sender ratchet), a dedicated group relay for large groups, and app
UI/integration in `AnonymousMessengerScreen`.

## 8. Phase F — Push notifications (least leaky possible)

Implement:

- Separate notification server receiving only push token + queue ID.
- Empty push: "check relay", no sender/content.
- Optional UnifiedPush on Android.
- Foreground/background fetch strategy and battery trade-offs.
- Document Apple/Google visibility as residual risk.

Acceptance:

- Push payload contains no message content or sender identity.
- Token and queue ID are the only server-side notification data.

Status (2026-11-18): acceptance met. Push types, sanitizer, client
`registerPush` / `fetchPushHint`, per-queue token derivation and a hint poller
(visibility/online aware, per-token backoff) exist; the app registers one token
per queue and polls on hints. Server endpoints store only `pushToken -> queueId`
and `ANON_PUSH_WEBHOOK_URL` forwards a token-only wake-up to a provider bridge.
Residual: no native FCM/APNs SDK or Android background receiver, so real
background delivery needs a UnifiedPush distributor or an operator bridge, and
the app still polls on wake; Apple/Google see a notification event (documented
in `docs/anonymity-protocol.md` and the privacy page). Push is disabled while a
proxy is configured.

## 9. Phase G — Spam and abuse resistance without identity

Implement:

- Queue creation rate limits.
- One-time invites with expiry and single use.
- Proof-of-work for first contact.
- Local block lists.
- Optional relay-side reputation based on queue behavior, not identity.
- Abuse reporting that does not deanonymize users.

Acceptance:

- Spammers cannot create unlimited queues cheaply.
- Blocked senders cannot bypass local filters. (Met for queue rotation: blocks
  key on the contact's `identityKey`, which the invite carries across relay
  moves. Not met against a sender who abandons the inbox entirely.)
- No phone/email/account required.

Status (2026-11-17): partial. Server rate limits exist. First-contact PoW is
generated by `pairing.ts`, carried in the invite, and verified server-side on
the first enqueue; the relay marks the challenge used. One-time invite tokens
exist: every queue is created with a random invite token, the relay stores only
its hash and burns it on the first enqueue, so a leaked invite cannot establish
a second contact. Local block lists (`blocks.ts`, keyed on the sender's queue
signing public key) are enforced in `pairing.ts` on `acceptInvitation` and
contact offers. The experimental screen supports blocking/unblocking and
explicit hash-only report upload through its pinned proxy route. The relay keeps
reports in a bounded, 90-day in-memory store and deduplicates retries. Queue
creation has its own budget per signing key (`ANON_CREATE_PER_SIGNING_KEY`,
10/hour, bucketed on the key hash and independent of the per-IP/proxy-client
limit), and a signing key with at least `ANON_SPAM_BLOCK_QUEUES` (3) live
reported queues gets `403 SIGNING_KEY_BLOCKED` on both the direct and the sealed
create paths; the block lifts as those reports expire. A report is only counted
when its `queueIdHash` names a queue this relay really issued for that signing
key (`403 UNVERIFIED_REPORT` otherwise, remembered for 7 days past the queue's
expiry), and the count is distinct queues rather than report ids, so three
report ids for a single queue still count once. Enqueueing on queues the
signing key already owns is deliberately untouched. Reports are durable: one
JSON file per report id under `ANON_REPORTS_DIR` (default `./anon-reports`),
reloaded at boot into the same store and spam index, deleted on expiry, and
memory-only with a warning when the disk is unwritable. Operator tooling is
`scripts/anon-reports.mjs` (`list`, `list --json`, `purge-expired`,
`remove <id>`); it works on the durable files, so a manually removed report
needs a relay restart to leave the in-memory store. The queue table is RAM-only,
so a report about a queue this
process no longer remembers is rejected — the block it already earned survives,
but new reports only count for queues created since the last restart.

## 10. Phase H — Multi-relay and rotation

Implement:

- Client supports multiple relays/operators/jurisdictions.
- Default relay selection strategy.
- Queue migration/rotation between relays.
- User can add self-hosted relay.
- Compromise resistance: proxy + destination relay must both be compromised.

Acceptance:

- Queues can move between relays without changing contact identity.
- Client can operate with at least two relays.
- Relay outage degrades gracefully.

Status (2026-11-18): partial, rotation works end to end in the library.
`rotateInbox(transportFor, inbox, now)` picks the next relay from the inbox's
`relays` list, builds a transport for that URL through the caller's factory, and
creates the new queue there; a test asserts the queue exists on the second
relay and not on the first. Rotation also had a latent bug: it generated two
proof-of-work challenges, kept one on the relay and advertised the other in the
invite, so every first contact to a rotated inbox would have failed with
`Invalid proof of work`; one challenge is now reused for both.
The app side of Phase H is wired too: `RelaySettings.extraRelays` takes a list
of relays, every queue records `relays` when it is created, `getTransport(url)`
keeps one transport per relay URL, and adding a contact no longer switches the
relay used for the user's own invite — each queue stays on the relay that
issued it. Polling counts consecutive failures per relay through
`relayHealth`, and after `FAILOVER_AFTER_FAILURES` the screen calls
`failoverInbox` for that one queue (notify list = the contacts that write to
it), persists the new invite and reports it; unrelated contacts stay put.
`migrateInbox` rotates and then sends the new invite to each contact inside a
normal sealed contact offer on that contact's own queue, returning the rotated
inbox plus `notified`/`failed` counts — a partial notification is reported, not
hidden, because an unnotified contact keeps writing to the old queue until it
expires. A test pairs two contacts across two relays, migrates, and delivers a
message on the new relay.

Contact identity across rotation: invites carry an optional `identityKey`, the
public signing key of that inbox's first queue. Rotation keeps it while issuing
a fresh queue key, and local block checks (`contactIdentity`,
`isBlockedContact`) run against it, falling back to the queue key for invites
written before the field existed. The experimental screen now blocks and shows
block state by that identity, while abuse reports deliberately still send the
current queue signing key, because the relay verifies reports against the key
that created the queue.

The identity claim is now bound to the queue key: `LocalInbox` keeps
`identitySigningKey`, `inviteFromInbox` emits an `identitySignature`
(Ed25519 by the identity key over the current queue signing key), and
`contactIdentity` honours `identityKey` only when it equals the queue key
(first invite) or the binding verifies. A forged or stripped signature falls
back to the current queue key, so a rotated offer cannot borrow an identity
without holding its private half. `pairingIdentity.test.ts` covers first
invites, rotation re-signing, forged signatures, unsigned claims and the legacy
fallback. A sender who creates a brand new inbox is still a stranger, so
blocking remains a speed bump rather than a ban.

Missing: a contact that misses a rotation or failover notice keeps writing to
the old queue until it expires. Failure counters now persist across restart
(`anon_relay_failures_v1`) and are cleared on a single successful probe.

## 11. Phase I — Optional strong anonymity transports

Implement:

- Tor transport option.
- Optional mixnet integration (Nym or equivalent).
- Dummy traffic profiles for high-security mode.
- Clear UX warnings about battery/cost.

Acceptance:

- Tor mode routes relay traffic through Tor.
- Mixnet mode is optional and documented.
- Users can choose privacy/performance trade-off.

Status (2026-11-18): partial. Tor endpoint validation exists (`tor.ts`), and
the transport can now actually run over Tor: `createTorFetch` is a
fetch-compatible client that forwards each request to the Tauri command
`anon_socks_request`, implemented in `src-tauri/src/anon_net.rs` as a dependency
free SOCKS5 CONNECT + HTTP/1.1 client. It only accepts plain `http://` `.onion`
URLs (a v3 onion service is authenticated and encrypted inside the Tor circuit),
never falls back to clearnet, and is wired into `createAnonTransport` through
`tor: true | { socksPort?, invoke? }`, so the direct relay and proxy transports
both work unchanged. Four Rust unit tests cover URL validation/parsing,
chunked bodies and status parsing; seven TypeScript tests cover the URL rules,
command payload, custom port, bridge failure, queue creation end to end and
error responses. The app has a Tor toggle in the advanced network settings: it
requires `.onion` relay/proxy URLs (plain `http://` onion is now accepted by
`isAllowedRelayUrl`), passes `tor: true` to every per-relay transport, and
disables push registration/polling while active, and verifies the local SOCKS
listener answers (`anon_tor_check`) before allowing Tor mode. Per-relay
round-trip latency is recorded (`src/lib/anon/relayLatency.ts`) so the
privacy/performance trade-off is measurable. Residual: no mixnet; Tor needs
the native Tauri shell.

## 12. Phase J — Verification, audit and release

Implement:

- Independent protocol audit.
- Reproducible relay builds.
- Public server source and build instructions.
- Security tests for timing, packet size and storage.
- Fuzzing for packet parser and relay commands.
- Red-team review of metadata leaks.
- Documentation of residual risks in `privacy.html` and in-app.

Acceptance:

- Audit report published or summarized.
- Relay build is reproducible.
- All critical/high findings fixed or documented.
- Residual risks clearly disclosed.

Status (2026-11-18): partial, with the in-repo items done. Packet parsing and
relay commands are fuzzed (`fuzz.test.ts` plus seeded `fuzz.relay.test.ts`);
storage and timing invariants are pinned in `storage.test.ts` (stored packet
shape, TTL, ACK deletion, queue expiry, command timestamp/nonce binding).
`docs/anonymity-audit.md` is the internal red-team record: per-party visibility,
eleven severity-tagged findings, the test matrix and a reproducible relay-build
recipe (pinned Node + `npm ci --omit=dev` + lockfile/`server.js` hashes +
container sketch). Residual risks are now disclosed in `landing/privacy.html`
and in the in-app Privacy Policy (`src/lib/legal.ts`, "Anonymous mode").
Still missing: independent audit, a red-team run against a deployed
relay/proxy, second-party build verification, and a formal audit report.

## 13. Suggested delivery order

1. Phase A — spec and types.
2. Phase B — v1 single-relay anonymous 1:1.
3. Phase D (minimum padding) — before any public relay use.
4. Phase C — proxy hop.
5. Phase F — push.
6. Phase E — groups.
7. Phase G — spam controls.
8. Phase H — multi-relay.
9. Phase I — Tor/mixnet.
10. Phase J — audit and hardening.

The current scaffold was built out of order (proxy before metadata hardening);
treat this list as a plan, not a record of what happened.

## 14. Mapping to current code

- Keep existing crypto primitives as the inner E2EE layer.
- Replace mesh relay delivery with queue-based relay protocol for anonymous mode.
- Keep sealed sender as the inner confidentiality layer.
- Reuse offline queue concepts, but make queue IDs and ACK semantics explicit.
- Reuse presence hashing, but make presence fully opt-in and document timing leaks.
- Keep current non-anonymous mode as a compatibility/fallback until v1 is stable.
- The `src/lib/anon/*` stack is imported by `AnonymousMessengerScreen` for an
  isolated text-only flow; it is not yet connected to ordinary `ChatScreen`
  history, attachments, or background polling.
- `server.js` already exposes v1 queue and proxy endpoints, but they are
  in-memory and are not part of a production deployment yet.

## 15. Residual risks to state honestly

- Global passive observer can correlate timing despite padding/jitter.
- Compromise of both proxy and destination relay collapses two-hop protection.
- Invite channel itself is metadata.
- Push providers see notification events.
- Device compromise bypasses all protections.
- Traffic volume can reveal group size.

### Implementation-specific risks (current scaffold)

- The proxy sees the destination relay id, request timing, and envelope sizes,
  but not queue ids, bearer tokens, or packet contents; routing-key pinning is
  client config.
- Failover sends the same sealed envelope to every configured proxy in turn,
  so a malicious proxy still learns the relay id and timing; it learns nothing
  new about the payload.
- Relay responses are not end-to-end authenticated, so a malicious proxy can
  drop or fabricate them (availability/DoS).
- The direct `/api/anon/queues` path bypasses the proxy; use `ProxyAnonTransport`
  sealed create instead.
- Legacy raw queue use shares one ID. `pairing.ts` uses independent queues, but
  timing/IP correlation remains without proxy/Tor.
- Relay queues live in RAM only.
- The one-time invite token travels inside the invite blob, so anyone who can
  read the invite can use the queue once; after that the token is burned.
- Queue-key signatures bind commands to the queue, token, action, timestamp and
  nonce, but do not authenticate a person: an invite carries the signing key, so
  any invite holder can inject messages.
- Sealed sender provides confidentiality but not sender authentication.
- Invite expiry is enforced in `pairing.ts`/`decodeInvite`, but direct transport
  configuration can still bypass invite validation.
- The Tor transport trusts a local SOCKS listener: if that port is not actually
  Tor, the destination is neither anonymized nor authenticated at the network
  layer. Only plain `http://` `.onion` URLs are accepted, and the bridge never
  falls back to clearnet, but the app does not yet check that Tor is running.
- The native bridge is deliberately dependency-free; it validates HTTP framing
  and status codes only. Packet signatures and sealed payloads remain the
  security boundary.
- Tor is a transport option (`createAnonTransport({ tor: … })`), not a visible
  setting in `AnonymousMessengerScreen` yet.
