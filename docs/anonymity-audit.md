# Anonymous Queue Layer — Internal Audit and Build Notes

Last updated: 2026-11-18 (F4.1–F4.4 applied)

Status: internal review only. This is **not** an independent audit. It records
what was checked in the repository, what remains exposed, and how to reproduce
the relay build and the security tests so an external reviewer starts from a
known state.

Scope: the v1 anonymous queue stack (`src/lib/anon/`), the relay endpoints in
`server.js`, and the experimental `AnonymousMessengerScreen` surface. The
ordinary E2EE P2P stack is out of scope here.

## 1. Method

1. Read the protocol document (`docs/anonymity-protocol.md`) against the code.
2. List every metadata field a relay, proxy, push provider or network observer
   can see, then check whether the code needs it.
3. Fuzz packet parsing, relay commands and the signature verifier.
4. Pin storage invariants (what is kept, for how long, what an ACK removes).
5. Record residual risks and the open items that cannot be fixed by a test.

Commands used for the automated part:

```bash
npx vitest run \
  src/lib/anon/fuzz.test.ts \
  src/lib/anon/fuzz.relay.test.ts \
  src/lib/anon/storage.test.ts \
  src/lib/anon/metadata.test.ts \
  src/lib/anon/relay.test.ts \
  src/lib/anon/signing.test.ts \
  src/lib/anon/packet.test.ts
```

## 2. What each party can see

| Party | Can see | Cannot see |
|---|---|---|
| Destination relay (direct mode) | queue id, sender IP, timing, fixed packet size, bearer token | message plaintext, sender identity, recipient queue beyond the queue itself |
| Destination relay (proxy mode) | queue id, proxy IP, timing, fixed packet size | sender IP, sender identity, plaintext |
| Proxy | relay id, connection timing, envelope size, proxy client IP | queue id, bearer token, plaintext, create credentials (sealed to the relay key) |
| Network observer | TLS endpoints, timing, fixed packet sizes | queue id, tokens, plaintext |
| Push provider (when enabled) | push token, that a hint was delivered | sender, content, queue id (only the relay maps token to queue) |
| Local device | everything | — |

## 3. Findings

Severity reflects impact on the anonymity goals, not on message
confidentiality. Status is `open`, `accepted` (residual risk, documented) or
`fixed`.

| ID | Severity | Finding | Status |
|---|---|---|---|
| A1 | High | The direct `/api/anon/queues` and `/api/anon/enqueue` paths expose the sender IP to the relay. Only `ProxyAnonTransport` hides it. | Open — proxy is the recommended path; direct mode must not be described as anonymous |
| A2 | Medium | Fixed packet sizes hide message length, but timing correlation remains: a global observer can still link a send and a poll. | Accepted — jitter reduces, does not remove, correlation |
| A3 | Medium | The invite blob carries the one-time invite token and the queue signing key. Anyone who can read the invite can inject one message before the honest sender. | Accepted by design — accept only invites received over a trusted channel |
| A4 | Medium | A blocked sender can start a new inbox and become a stranger again. Rotation claims are now bound by `identitySignature`, so a rotated invite can no longer borrow another identity without its private key, but a brand-new inbox is still a new identity. | Accepted — blocking is a speed bump, not a ban |
| A5 | Medium | Sealed sender gives confidentiality but not sender authentication: the queue signature authenticates the queue, not a person. | Accepted — out of scope for v1 |
| A6 | Low | Relay responses are not end-to-end authenticated; a malicious proxy can drop or fabricate replies. | Accepted — availability/DoS only |
| A7 | Low | Queue state and the report-to-queue index were RAM-only, so a restart forgot which queues a key created and new reports about old queues were rejected. | Partially fixed — queues, packets and the owner index are persisted to SQLite (`ANON_STATE_DB_PATH`); replay nonces and rate-limit buckets remain in memory. |
| A8 | Low | File transfer uses the `large` profile, so the profile choice itself leaks that a transfer is happening. | Fixed — F1.2 wired file transfer into the app; `profileForPacketSize()` maps wire length back to profile, and `receiveAnonPackets()` uses it instead of hard-coded `'standard'`; `assembleFile` verifies SHA-256. Residual: profile choice still hints a transfer is in progress. |
| A9 | Low | HTTP ACK/control request bodies are variable-length even though relay packets are fixed. | Open |
| A10 | Low | Invite `expiresAt` is enforced at decode time but direct transport configuration can bypass invite validation. | Accepted — only reachable by editing local settings |
| A11 | Info | Tor/onion routing is available through the native SOCKS bridge and `createTorFetch`, but the experimental screen has no Tor toggle yet, so it is opt-in through transport configuration only. | Partially fixed — Phase I (`relayLatency.ts`, `tor.ts`, `checkTorRunning`) landed; the app Tor toggle validates `.onion` URLs, verifies the SOCKS listener via `anon_tor_check`, and disables push while active. UI wiring remains optional. |

No finding lets the relay read message content or link a sender to a recipient
when proxy mode and independent inbox queues are used.

## 4. Storage invariants pinned by tests

`src/lib/anon/storage.test.ts` asserts:

- a stored packet has exactly `version`, `queueId`, `packetId`, `createdAt`,
  `ttlMs`, `payload` — no sender or recipient token, no signing key, no invite
  token;
- packet TTL is enforced on poll and by `cleanup()`;
- ACK removes ciphertext immediately;
- an expired queue rejects enqueue and is removed by `cleanup()`;
- signed commands bind action, queue, token, payload, timestamp and nonce, so
  tampering with any of them invalidates the signature.

`src/lib/anon/fuzz.relay.test.ts` uses a seeded PRNG (no flaky runs) to feed
random queue ids, tokens, payloads, limits and signatures through the relay
and the verifier; every rejection is a plain `Error`, never a crash.

Operator review of abuse reports uses `scripts/anon-reports.mjs`:
`list` (human table), `list --json`, `purge-expired`, and `remove <reportId>`.
It reads the same `ANON_REPORTS_DIR` files the relay loads at boot and never
shows message content. A manually removed report leaves the running relay's
in-memory store only after a restart, which the tool prints as a reminder.

## 5. Reproducible relay build

The relay is plain ESM (`server.js`) plus `express` and `dotenv` from
`package-lock.json`; there is no compile step. Reproducibility therefore means
a pinned Node version and a locked dependency tree.

1. Use Node 20 LTS or newer (the project is developed on Node 22). Record the
   exact version in the release notes: `node -v`.
2. Install exactly from the lockfile, production dependencies only:
   `npm ci --omit=dev`.
3. Record the hashes that define the build:

   ```bash
   sha256sum server.js package-lock.json        # Linux/macOS
   Get-FileHash server.js,package-lock.json -Algorithm SHA256   # Windows
   ```

4. Start the relay with the same environment layout as production
   (`PORT`, `ANON_REPORTS_DIR`, `ANON_*` limits; see `.env.example`).
5. Build the landing bundle only if it is part of the release:
   `npm run deploy:landing` (this runs `vite build` first; it does not touch
   the relay).

A minimal container definition for the release artifact:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json server.js ./
RUN npm ci --omit=dev
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
```

Pin the image digest in the release notes; `node:22-alpine` intentionally
floats on the 22.x line. The container serves only the relay and the staged
landing bundle; it stores no message content beyond the queue TTL.

## 6. External-audit checklist

- [x] Protocol document matches the implemented packet/command formats.
- [x] Packet parser and file chunking are fuzzed.
- [x] Relay commands and signature verification are fuzzed.
- [x] Storage invariants and TTL/ACK behaviour are covered by tests.
- [x] Packet-size audit covers all three profiles for messages, receipts and
      control payloads.
- [x] Reproducible relay build instructions are written down.
- [ ] Independent protocol audit.
- [ ] Red-team exercise against a deployed relay and proxy.
- [ ] Reproducible build verified by a second party on a clean machine.
- [ ] All High/Medium findings either fixed or explicitly accepted in the
      public privacy page.
