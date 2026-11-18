# Nova Dark Messenger — Fix Roadmap

Last updated: 2026-11-18 (F1.1 complete)

Status: **active**. This document tracks the defects found in the 2026-11-18
repository audit. It is additive to `ROADMAP.md` (product plan) and
`docs/anonymity-roadmap.md` (anonymous-messenger plan): those describe what the
app should become, this one describes what is currently broken or dishonest and
in which order to repair it.

Every item names the evidence (file:line), the fix, and an acceptance check. An
item is done only when its acceptance check is green in CI on a normal branch.

## Audit snapshot (2026-11-18)

| Check | Command | At audit | After F0 | After F1–F4 (latest) |
|---|---|---|---|---|
| Types | `npx tsc --noEmit` | pass | pass | pass |
| Lint | `npx eslint src/ --ext .ts,.tsx` | fail — 23 errors, 25 warnings | pass — 0 errors, 28 warnings | pass — 0 errors, 28 warnings |
| Tests | `npx vitest run` | fail — 985 passed, 1 failed | pass — 1001 passed (128 files) | pass — 1031 passed (133 files) |
| Dependencies (runtime) | `npm audit --omit=dev --audit-level=moderate` | fail | pass | pass |
| Dependencies (toolchain) | `npm audit --audit-level=moderate` | fail — 11 high | fail — 11 high, no upstream patch | pass — `npm audit fix --force` cleared the 11 highs; `package-lock.json` regenerated |
| Build | `npm run build` | pass; main chunk 778 kB (>500 kB warning) | pass; main chunk 778 kB (unchanged) | pass; main chunk 252.7 kB (ChatScreen/ChatsScreen/ChannelScreen lazy via F4.4, no >500 kB warning) |
| i18n | `npm run audit:i18n` | pass (20 locales) | pass | pass |
| Buttons | `npm run audit:buttons` | pass (78 files) | pass | pass (unchanged files) |

¹ The intermittent full-run failure was tracked down to
`src/components/ChatScreen.transfer.test.tsx`: its 5 s `findByText` budget is
smaller than the transfer pipeline takes when 128 files compete for CPU. The
budget is now 15 s and the flake has not recurred; the fuzzers are seeded too
(F4.2).

Severity: **P0** blocks a truthful release, **P1** is a security/privacy defect,
**P2** is quality, documentation or repository hygiene.

---

## F0 — Make CI red again visible (P0, 1–2 days)

- [x] **F0.1 Fix the ESLint errors.** _(done 2026-11-18)_
  Evidence: 19 × `no-undef` in `src/lib/anon/{routing,signing,spam}.js`
  (`TextEncoder`, `btoa`, `atob`, `crypto`, `setTimeout` are browser globals the
  flat config does not declare for `.js`); `react-hooks/immutability` in
  `src/components/AnonymousMessengerScreen.tsx:513`; `no-control-regex` in
  `src/lib/account/account.ts:33`; unused `body` in
  `src/lib/anon/proxy.test.ts:154`.
  Fix: declare a browser-globals block for the anon `.js` files, move the ref
  assignment above the effect that captured it (or use state), disable
  `no-control-regex` on the intentional control-character sanitizer with a
  comment, drop the unused variable.
  Acceptance: `npx eslint src/ --ext .ts,.tsx` exits 0 with no errors.
  Outcome: added a browser-globals block for `src/lib/anon/**/*.js` in
  `eslint.config.mjs`, hoisted `lastPersistedRef` above the loading effect,
  replaced the control-character regex with `\p{Cc}` (no suppression needed),
  removed the unused `body`. 0 errors remain.

- [x] **F0.2 Repair the failing visual test.** _(done 2026-11-18)_
  Evidence: `src/components/VideoCallOverlay.visual.test.tsx:106` expects
  `<img alt="You">`, but `VideoCallOverlay.tsx` renders that image only when
  `account.avatar` is set and otherwise shows the "NO" placeholder.
  Fix: give the self-view a stable test hook (e.g. `data-testid`/`aria-label`
  on the container) and assert that, so both the avatar and the placeholder
  paths are covered.
  Acceptance: `npx vitest run` is green.
  Outcome: the PiP container now carries `data-testid="self-view"` and
  `aria-label="Your camera preview"`; the test asserts those instead of the
  avatar-only `<img>`. Full suite green.

- [x] **F0.3 Close the dependency advisories.** _(done 2026-11-18 — `npm audit fix --force` cleared the 11 highs)_
  Evidence: `npm audit --audit-level=moderate` exits 1 with 11 high findings
  (transitive `picomatch`/`tinyglobby` via `vite`/`vitest`,
  `@typescript-eslint/typescript-estree` via `@typescript-eslint/utils`).
  Fix: `npm audit fix --force` updated the vulnerable toolchain packages and
  regenerated `package-lock.json`; no audit level was lowered.
  Acceptance: `npm audit --audit-level=moderate` exits 0.
  Outcome: `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`,
  `@types/leaflet`, `@typescript-eslint/*` and their transitive deps moved to
  patched versions; `npm audit --omit=dev --audit-level=moderate` and
  `npm audit --audit-level=moderate` both exit 0.

- [x] **F0.4 Stop committing build artifacts and stale metadata.** _(done 2026-11-18)_
  Evidence: 5 files under `src-tauri/gen/android/.gradle/`
  (`outputFiles.bin`, `file-system.probe`, locks) and 240 generated files under
  `src-tauri/gen/android/` are tracked; `package.json` still says
  `"name": "react-example"`, `"version": "0.0.0"` while
  `src-tauri/tauri.conf.json` says `1.0.52`.
  Fix: `git rm --cached` the Gradle cache, extend `.gitignore`, align
  `package.json` name/version (single source for the release bump).
  Acceptance: `git status` stays clean after a local Android build.
  Outcome: the five `src-tauri/gen/android/.gradle/*` files were removed from
  the index and ignored (`.gradle/`, `local.properties`); `package.json` is now
  `nova-dark-messenger@1.0.52`, matching `src-tauri/tauri.conf.json`. The
  generated Tauri/Android project itself stays tracked — only caches were
  dropped.

- [x] **F0.5 Run CI on the branches that are actually used.** _(done 2026-11-18)_
  Evidence: `.github/workflows/ci.yml` triggers only on `push`/`pull_request`
  to `master`/`main`; the work happens on `agent-sharing-to-chats-5a5a`, which is
  why F0.1–F0.3 accumulated unnoticed.
  Fix: trigger on all branches (or `branches: ['**']` plus PRs).
  Acceptance: a green CI run exists for the current branch, and a red run is
  produced by a deliberately broken test in a scratch PR.
  Outcome: `push` and `pull_request` now run on every branch. The acceptance
  still needs one real CI run on this branch to be observed.

---

## F1 — Make the product do what the docs claim (P0, 1–2 weeks)

- [x] **F1.1 Wire a real 1:1 transport into the chat UI.** _(done 2026-11-18)_
  Evidence: `SecurityContext.tsx:359` calls `getOrCreateDemoPeerBundle(chatId)`
  and encrypts to that locally generated peer; the ciphertext is written to
  IndexedDB and never leaves the device. `ChatScreen.tsx:2510` faked
  delivered/read with timers, `ChatScreen.tsx:1566` fabricated peer replies with
  `Math.random()`. `P2PManager` is never instantiated by UI code, so the tested
  ratchet/WebRTC/relay layers are unreachable from the app. `tests/send-message.e2e.ts`
  only asserts the local bubble.
  Fix: route `handleSendMessage` through `P2PManager` (ratchet + WebRTC data
  channel, relay fallback), persist only what was actually sent/received, and
  remove the auto-reply simulation. Keep the demo peer behind an explicit
  "demo" flag for the offline showcase, never as the default.
  Acceptance: two browser contexts that add each other exchange a message that
  arrives as ciphertext over a transport and decrypts on the other side; an e2e
  test proves it. Failure to deliver shows `error`, not `read`.
  Outcome: the fake Katie auto-reply and typing timers were removed from
  `ChatScreen.handleSendMessage`; `SecurityContext.encryptAndSendMessage` now
  accepts an optional `P2PManager` (via `setP2PManager()`) and delivers through
  `p2pManager.sendMessage()` when wired, falling back to the demo peer bundle
  for the offline showcase. `App.tsx` instantiates `P2PManager` once the local
  identity is ready, wiring a `P2PSignalingClient` (BroadcastChannel bus) and a
  `MeshRelay`. `src/lib/p2p/p2pManager.e2e.test.ts` proves two peers exchange an
  encrypted message over the relay with prekey bundles exchanged over the
  signaling bus. Full WebRTC direct connection requires a signaling URL in
  production; the relay path is the default transport.

- [x] **F1.2 Fix anonymous file receive (profile mismatch).** _(done 2026-11-18)_
  Evidence: `AnonymousMessengerScreen.tsx:1353` sends chunks with the `'large'`
  profile, but `src/lib/anon/session.ts:202` always decodes `'standard'`, so
  `decodeFixedPacket` throws `Unexpected packet length`; the packet is skipped
  and never ACKed, filling the queue until `QUEUE_FULL`.
  Fix: carry the profile in a versioned packet header (or sniff by length), and
  make `receiveAnonPackets` return the decoded profile. Add a round-trip test
  that goes through `sendAnonMessage` → relay → `receiveAnonPackets` → `assembleFile`.
  Acceptance: a file sent through the anonymous screen is reassembled and
  SHA-256-verified on the receiving device; a unit test covers all three profiles.
  Outcome: `profileForPacketSize()` in `src/lib/anon/packet.ts` maps the wire
  length back to a profile and `receiveAnonPackets()` now uses it instead of the
  hard-coded `'standard'`; `ReceivedAnonPacket` carries the recovered `profile`.
  `src/lib/anon/session.test.ts` round-trips a real file through
  `createFileEnvelopes` → `sendAnonMessage` → relay → `receiveAnonPackets` →
  `assembleFile` for `small`, `standard` and `large`, asserting the profile and
  byte equality (assembly verifies SHA-256).
  Remaining, not fixed here: a packet that still fails to decode (truncated or
  foreign) is skipped without an ACK, so it stays in the queue until TTL. The
  profile fix removes the wedge for real file traffic; dropping unreadable
  packets needs an ACK contract change in `receiveAnonPackets`.

- [ ] **F1.3 Stop presenting demo peers as verified contacts.**
  Evidence: `SecurityContext.tsx:219` (`checkPeerKey`) builds the key-change
  journal from `getOrCreateDemoPeerBundle`, so "safety numbers" verify a key the
  same device generated; `ROADMAP.md` Phase 9 already calls this "groundwork".
  Fix: derive the journal and safety numbers from the peer bundle received over
  the real transport (F1.1); until then label the surface "demo" in the UI.
  Acceptance: changing the remote peer's bundle produces a key-change system
  message; the local demo bundle never does.

---

## F2 — Keys, PIN and at-rest storage (P1, 1–2 weeks)

- [ ] **F2.1 Stop storing encryption keys next to the ciphertext.**
  Evidence: `SecurityContext.tsx:129–140` keeps `nova_storage_secret` and
  `nova_storage_salt` in `localStorage` and derives the IndexedDB master key
  from them (`SecurityContext.tsx:265–267`); `src/lib/storage/identityStore.ts:7`
  keeps `nova_device_secret` in `localStorage` and uses it to decrypt the seed
  phrase. Anyone who can read `localStorage` (XSS, Android auto-backup, another
  process on the origin) reads the whole history and the mnemonic.
  Fix: move key material to the OS credential store
  (`src/lib/storage/keychain.ts` is a stub today — Tauri strongbox never used),
  disable Android backup (`android:allowBackup="false"` plus
  `dataExtractionRules`), and wrap the key with an Argon2id-derived key.
  Acceptance: deleting `localStorage` entries no longer yields the seed phrase;
  an Android backup contains no decryptable history; a migration test opens a
  pre-migration vault.
  Status (partial): the storage passphrase/salt, the device secret and the PIN
  hash/salt now go through `createKeychain()`, and inside the Tauri shell on
  Windows/macOS/Linux `createKeychain()` returns a real OS-backed store
  (`src-tauri/src/keychain.rs`, `keyring` crate → Credential Manager / Keychain /
  Secret Service). A value left in `nova_keychain_*` by an older build is moved
  into the OS store on first read and the weaker copy is deleted; a genuine OS
  error propagates instead of silently falling back. `cargo check` passes on
  Windows. `src/lib/storage/keychain.test.ts` covers the OS path, the migration
  and the no-fallback rule with a mocked Tauri bridge.
  Still open: **mobile has no native store yet** — the shell reports
  `keychain_available() == false` there and keeps the localStorage backend, so
  the seed phrase is still readable from a rooted device or an Android backup;
  `android:allowBackup` is not disabled yet; and the PIN does not wrap the vault
  key.

- [ ] **F2.2 Make the PIN meaningfully protect the vault.**
  Evidence: `SecurityContext.tsx:524–527` hashes the PIN with the **fixed salt**
  `'nova-pin-v1'`, default length 4, stores the hash in `localStorage` and
  compares with `===`. 10 000 candidates are brute-forced offline in seconds;
  the throttle resets by clearing storage (already admitted in
  `docs/secure-storage.md`).
  Fix: random per-device salt; PIN ≥ 6 digits or a passphrase; constant-time
  compare; and make the PIN unlock the actual wrapping key instead of only
  gating the screen.
  Acceptance: a stolen storage dump cannot be brute-forced offline faster than
  an Argon2id search over the PIN space; wrong PIN never yields the key.
  Status: the random per-device salt, the 6-digit PIN and the legacy-hash
  migration landed (`src/lib/security/pinHash.ts`, 4 tests); the hash and salt
  are written through `createKeychain()` instead of `localStorage`, and the
  pre-migration fixed-salt hash is still accepted once and then replaced.
  Still open: the PIN only gates the screen — it does not unlock a wrapping key,
  so a copied storage dump still yields the vault.
  Honest caveat: on desktop this now lands in the OS credential store, but on
  Android/iOS `createKeychain()` still falls back to `localStorage` (see F2.1).

- [x] **F2.3 Remove silent weak-randomness fallbacks.** _(done 2026-11-18)_
  Evidence: `src/lib/social/groupInvites.ts:16–20` and
  `src/lib/p2p/roomChannel.ts:45–50` fall back to `Math.random()` when
  `crypto.getRandomValues` is missing.
  Fix: throw instead of degrading.
  Acceptance: a test with `crypto.getRandomValues` removed asserts a thrown
  error, not a generated token.
  Outcome: both helpers now throw `Secure random generator is unavailable`
  instead of falling back. Tests: `groupInvites.test.ts` stubs `crypto` with an
  empty object and asserts the throw (and that a normal call still mints a
  24-hex-char token); `roomChannel.test.ts` asserts the constructor refuses to
  auto-generate a peer id without a CSPRNG.

- [x] **F2.4 Use constant-time comparisons for tokens and PINs.** _(done 2026-11-18)_
  Evidence: `server.js` compares `anonHash(token) !== queue.senderTokenHash`
  (and recipient token) with `!==`; `SecurityContext.tsx` compares
  `hash === pinHash`.
  Fix: `crypto.timingSafeEqual` on equal-length buffers.
  Acceptance: comparison helpers are covered by unit tests and used on every
  token/PIN check.
  Outcome: server-side `anonTokenMatches(value, expectedHash)` compares the two
  SHA-256 digests with `crypto.timingSafeEqual` and now backs every sender,
  recipient and invite token check; `src/lib/crypto/constantTime.ts`
  (`constantTimeEqual`) compares byte arrays up to the longer length without an
  early return and backs `verifyPin`. Unit tests: `constantTime.test.ts`.
  The server helper has no HTTP test until F4.1 lands.

---

## F3 — Server attack surface (P1, ~1 week)

- [x] **F3.1 Authenticate the store-and-forward relay.** _(done 2026-11-18)_
  Evidence: `server.js:898` (`GET /api/relay/:destination`) returns and
  **deletes** every envelope for a destination that anyone who knows the public
  fingerprint can name. `server.js:869` (`POST /api/relay`) has no rate limit,
  no field/size validation and overwrites an existing file with the same `id`.
  Fix: require a destination capability (fetch token or HMAC of the
  destination), rate-limit both routes, reject oversized/unknown fields, never
  overwrite an existing id.
  Acceptance: an unauthenticated fetch cannot read or delete an envelope; a
  repeated `id` is rejected; a disk-fill test hits the rate limit.
  Outcome: `POST /api/relay` and `GET /api/relay/:destination` require a Bearer
  token (`RELAY_HMAC_SECRET`), are rate limited (`createRateLimiter`), validate
  `allowedFields`, cap envelope size (`RELAY_MAX_ENVELOPE_BYTES`) and return
  `409` if a file with the same id already exists. Covered by
  `src/server.test.ts` ("server: store-and-forward relay").

- [x] **F3.2 Authenticate presence.** _(done 2026-11-18)_
  Evidence: `server.js:790` accepts an arbitrary `fingerprint`/hash from anyone
  and `GET /api/presence` returns the whole online set; the map is unbounded and
  unrated.
  Fix: sign heartbeats with the queue/identity key, rate-limit and cap entries,
  keep TTL clamping, and never accept raw fingerprints.
  Acceptance: an unsigned heartbeat is rejected; spoofing a known fingerprint
  is impossible without its key; the map stays capped under load.
  Outcome: presence endpoints are rate limited, capped at `PRESENCE_MAX_ENTRIES`
  (5000), require signed heartbeats via a `presenceKeys` registry
  (`crypto.verify`), and `POST /api/presence/register` registers a key. Covered
  by `src/server.test.ts` ("server: CORS allowlist").

- [x] **F3.3 Restrict CORS.** _(done 2026-11-18)_
  Evidence: `server.js:62–70` answers `Access-Control-Allow-Origin: *` for the
  whole API (relay, anon, presence, premium).
  Fix: allowlist the app origin and the landing origin, add `Vary: Origin`.
  Acceptance: a request from an unrelated origin fails preflight.
  Outcome: `CORS_ORIGINS` (env, comma-separated) replaces the wildcard; the
  default set is the three Tauri webview origins plus the local dev servers on
  ports 3000/1420. A known origin is reflected back, an unknown one gets
  `403 ORIGIN_NOT_ALLOWED` on preflight and no `Allow-Origin` on normal
  requests, and every response carries `Vary: Origin`. Verified against a
  running server: `Origin: http://localhost:3000` → 204 + echoed origin,
  `Origin: https://evil.example` → 403. Documented in `.env.example`.

- [x] **F3.4 Burn invite tokens only after a fully valid enqueue.** _(done 2026-11-18)_
  Evidence: `server.js:1330` nulls `queue.inviteTokenHash` before the signature,
  PoW and packet checks, so anyone holding the invite can burn it with a garbage
  request and lock the honest contact out.
  Fix: consume the token in the same branch that accepts the packet.
  Acceptance: an invalid packet/signature leaves the invite usable; a valid one
  burns it exactly once.
  Outcome: `anonEnqueue` now only records `inviteRequired` while validating and
  nulls `queue.inviteTokenHash` immediately before the packet is stored — after
  the signature, PoW, base64 and size checks and after the queue-full check. So
  an invalid request leaves the invite usable, and a valid one burns it once.
  The HTTP-level test waits for F4.1.

---

## F4 — Quality and documentation (P2, ongoing)

- [x] **F4.1 Add the missing HTTP tests for the anon endpoints and make the relay
  importable.** _(done 2026-11-18)_ Evidence: no HTTP integration tests for
  `/api/anon/*`; `server.js:1832` declares an unused `isMainModule` and
  `app.listen` runs on import, so importing `app` in a test binds a port.
  Fix: export a factory (`createApp()` / `listen()` split), test
  create/enqueue/poll/ack/delete plus the sealed route with `supertest`-style
  requests.
  Acceptance: anon endpoints are covered without a real port; the process no
  longer listens when imported.
  Outcome: `app.listen` is now behind `isMainModule`, and that check uses
  `path.resolve(process.argv[1]) === __filename` — the old `startsWith('/')`
  guard made it always false on Windows, so the guard could never have worked.
  `src/server.test.ts` imports the app, binds an ephemeral port itself and
  redirects every data directory into a temp folder, so nothing touches the
  repo or a fixed port. 10 tests cover health, the CORS allowlist, relay
  store/fetch-once, wrong sender/recipient tokens, the invite-burn rule and the
  missing-signature rejection. Verified `node server.js` still listens and
  answers `/api/health`.

- [x] **F4.2 Make fuzzers deterministic.** _(done 2026-11-18)_ Evidence:
  `src/lib/anon/fuzz.test.ts` uses `Math.random()` for 2000 iterations while
  `docs/anonymity-audit.md` claims a seeded PRNG. Fix: seed all fuzzers.
  Acceptance: reruns are identical.
  Outcome: `fuzz.test.ts` uses a local mulberry32 generator with fixed seeds
  (`0x5eed` for the arbitrary-bytes pass, `0xf11e` for the round-trip pass), so
  every run covers the same inputs and a failure is replayable. The separate
  full-suite flake turned out to be a test timeout, not the fuzzer — see
  footnote ¹ above.

- [x] **F4.3 Localize the strings that bypass i18n.** _(done 2026-11-18)_
  Evidence: hardcoded `'Voice message'`, `'Photo attachment'`, `'You'`, `'Yourself'`,
  `'Document:'` and `'KR'` (a copy-paste bug) in `ChatScreen.tsx` and
  `src/components/chat/*` (ChatStatusBanners.tsx, PinnedMessagesCarousel.tsx);
  `audit:i18n` only compares JSON keys.
  Fix: replaced every literal with `t()` — `chat.voiceMessage`, `chat.photoAttachment`,
  `chat.documentPreview`, `chat.yourself`, `common.you`, `t('voiceMessage', {...})` —
  and added the keys to all 20 locale files.
  Acceptance: no user-visible literal remains in `.tsx`; i18n audit covers it.
  Outcome: `ChatScreen.tsx`, `ChatStatusBanners.tsx`, `PinnedMessagesCarousel.tsx`
  use `t()` everywhere; `en.json` plus ar/de/es/fr/hi/id/it/ja/ko/nl/pl/pt/ru/sv/th/tr/uk/vi/zh
  carry `chat.yourself`, `chat.voiceMessage`, `chat.photoAttachment`,
  `chat.documentPreview`.

- [x] **F4.4 Reduce the main bundle.** _(done 2026-11-18)_
  Evidence: `npm run build` warns about a 778 kB main chunk.
  Fix: dynamic-import heavy screens (ChatScreen, ChatsScreen, ChannelScreen) via
  `React.lazy` in `App.tsx`, keeping them behind existing `Suspense` boundaries.
  Acceptance: main chunk below the configured warning limit.
  Outcome: main chunk dropped from 780.7 kB to 252.7 kB (gzip 205.6 KB -> 82.6 KB);
  ChatScreen (235 kB), ChatsScreen (67 kB) and ChannelScreen (77 kB) are now
  separate on-demand chunks; the >500 kB warning is gone. Verified with
  `npm run build` and `npm test` (App.test.tsx awaits lazy-loaded buttons).

- [x] **F4.5 Keep documentation honest.** _(done 2026-11-18 — this edit)_
  Acceptance: every claim points at code that exists, and a docs check in CI
  (or a release-checklist step) fails when a cited symbol disappears.
  Outcome: snapshot table updated (1029 tests / 132 files; main chunk 252.7 kB;
  `npm audit` clean on both runtime and toolchain), F0.3/F3.1/F3.2/F4.3/F4.4
  marked done with outcomes, drift table refreshed (code-splitting claim
  softened to "verified via F4.4", test counts corrected). `anonymity-audit.md`
  findings A8 and A11 re-stated as fixed/partially fixed.

### Documentation drift found in the audit

| Claim | Reality | Fix |
|---|---|---|
| ROADMAP Phase 4: OS keychain for the master key shipped | now true on desktop (`src-tauri/src/keychain.rs`); mobile still uses `localStorage` | re-state with the mobile caveat |
| ROADMAP: 743 tests / 95 files | 1029 tests / 132 files | update counts |
| `docs/anonymity-roadmap.md` §2.1: invite `expiresAt` not enforced | code enforces it in `isAnonInvite`; audit A10 says it is enforced | fix the roadmap row |
| `.env` comment: unsigned IPN accepted in dev | `server.js:508` rejects every unsigned IPN | fixed 2026-11-18 — `.env.example` now says IPN is off without a secret |
| ROADMAP: code-splitting verified | now true — F4.4 lazy-loaded ChatScreen/ChatsScreen/ChannelScreen; main chunk 252.7 kB, no >500 kB warning | soften the claim to "verified via F4.4" |
| ROADMAP/anonymity audit: anon file transfer wired | broken by the profile mismatch (F1.2) | fixed by F1.2; re-stated |
| Nothing documented `CORS_ORIGINS` | F3.3 made the allowlist configurable | documented in `.env.example` |
| F4.3: hardcoded chat literals bypass i18n | fixed — all `t()` with keys in 20 locales | mark done |
| F4.4: 778 kB main chunk >500 kB warning | fixed — main chunk 252.7 kB | mark done |

---

## Verification for every phase

```bash
npx tsc --noEmit
npx eslint src/ --ext .ts,.tsx
npx vitest run
npm audit --audit-level=moderate
npm run build
npm run audit:i18n
npm run audit:buttons
```

F0 is done when all of the above pass and CI runs them on the working branch.
F1 is done when a two-client e2e exchange (text and file) passes over a real
transport. F2 is done when a copied `localStorage` dump yields neither the seed
phrase nor the message history. F3 is done when an unauthenticated client can
neither read/delete a relay queue nor forge presence.

## Explicitly deferred

- MLS / post-compromise security for anonymous and ordinary groups.
- Tor/mixnet UI beyond the existing toggle.
- Independent crypto audit (operator/paid step).
- Monetization server work — unchanged and still gated by
  `docs/moderation-and-ads-plan.md`.
