# Nova Dark Messenger — Bots Roadmap

Last updated: 2026-11-19

This roadmap turns the bot-integration plan (derived from the audit of the old
`neumorphic-ui` messenger) into an implementable plan for **this** codebase.
Like `docs/anonymity-roadmap.md`, it is incremental: every phase ships with
tests and must not break the existing secure-messaging baseline.

**Implementation status:** B0 and B1 are **implemented** (see §3); the echo
bot example (`examples/bots/echo/`) runs through the runtime tests, and the
inline-keyboard UI (`MessageInlineKeyboard.tsx` + `ChatScreen.onBotCallback`)
is wired in `App.tsx` via `src/lib/bots/session.ts`. B2–B8 are the target,
not a description of what is finished.

## 0. Scope and non-goals

Goal: give developers a way to build bots for Nova without violating the
guiding constraints in `ROADMAP.md`:

- no PII collection, no central account registry;
- no extra servers for core functionality — messaging stays P2P;
- local-first encrypted storage;
- open, auditable cryptography (X25519, Ed25519, X3DH, Double Ratchet).

Consequence: a **centralized Telegram-style bot platform stays out of scope**
for the core product. Bots are delivered in three tiers, each useful on its
own:

| Tier | What it is | Server required | E2EE |
|---|---|---|---|
| **L1 — local bots** | Bots running inside the user's own app/webview (webhook/plugin model), like a local extension | No | Bot sees plaintext of chats it is explicitly granted |
| **L2 — self-hosted Bot API gateway** | Optional add-on: owner runs a small gateway holding the bot's keypair; the bot is a regular E2EE participant | Owner's own server (opt-in) | Yes — chat stays E2EE, gateway holds the bot key |
| **L3 — Telegram-compatible surface** | The same gateway speaks a Telegram Bot API-shaped protocol so grammY/telegraf/aiogram work after a base-URL change | Owner's gateway | Yes (see L2) |

Non-goals for v1:

- a hosted bot directory / bot store with a central registry;
- server-side bot token verification on `mess.cvr.name` (that server stays
  stateless relay + PaymentO only);
- Mini Apps in the first release (see Phase 5 — deliberately deferred).

## 1. Baseline: what exists today

- **No bot code at all.** A search for bot-related symbols across `src/`
  returns nothing: no `BotConfig`, no `BotService`, no bot UI. The bots track
  starts from zero here (unlike the old `neumorphic-ui` repo, which had UI
  stubs and client-side key generation — the parts we deliberately do **not**
  port; see §7).
- E2EE 1:1 with hybrid PQ X3DH (`src/lib/crypto/ratchet.ts`,
  `src/lib/crypto/postQuantum.ts`) and Sender Keys groups
  (`src/lib/crypto/senderKeys.ts`, `src/lib/p2p/groupManager.ts`).
- P2P transports: WebRTC mesh per room (`src/lib/p2p/roomChannel.ts`),
  store-and-forward relay (`src/lib/p2p/httpRelay.ts`, `server.js`
  `/api/relay`), offline queue (`src/lib/network/offlineQueue.ts`).
- Anonymous transport stack (`src/lib/anon/*`) with fixed-size packets,
  one-way queues and signed relay commands.
- A thin stateless server (`server.js`): relay envelopes, presence,
  PaymentO IPN, CORS allowlist, HTTP tests.
- Local-only plugin-ish precedent: none yet; the closest pattern is the
  settings/feature-gating in `src/lib/premium.ts` and the local ads module
  (`src/lib/ads/localAds.ts`).

## 2. Architecture decision: the bot is a participant with its own key

Variant chosen: **A — the bot is a regular chat participant with its own
X25519/Ed25519 keypair.** A chat with a bot remains end-to-end encrypted;
whoever holds the bot's key can decrypt it. This is the only option that is
consistent with the "safer than Telegram" positioning.

- **L1 (local bots):** the bot's key lives in the user's own vault
  (`src/lib/security/vaultKey.ts`, `src/lib/storage/identityStore.ts`), the
  bot code runs locally (web worker / hidden webview / Node sidecar via a
  Tauri plugin). The bot process calls an in-process `BotContext` API —
  no network at all.
- **L2/L3 (gateway bots):** the owner runs a gateway that holds the bot
  keypair and exposes an HTTP interface. The gateway joins the P2P/relay
  transport as the bot's device. The user's chat stays E2EE; the gateway is
  the bot's "device" exactly like a linked device in
  `src/lib/p2p/deviceLinking.ts`.

Explicitly rejected: cloud chats where the bot reads plaintext on a server
(old variant B). If anyone builds such a gateway anyway, the client must
label the chat "this chat is not end-to-end encrypted" — the flag already
exists conceptually in the chat metadata model.

Token model (fixes the main flaw of the old repo, where the token embedded
the bot's private key):

- For L2/L3 the gateway owner generates the bot identity **on the gateway**;
  the app only ever receives the bot's *public* bundle (like a peer prekey
  bundle). There is no bearer token in the core product at all.
- For the L3 HTTP surface the gateway may issue its own tokens
  (`<botId>:<32 random bytes>`), storing only a hash — same shape as the
  invite tokens hardened in fix-roadmap F3.4. Never embed key material in a
  token.

## 3. Phases

### Phase B0 — Contracts and types (2–3 days) — ✅ Done (2026-11-19)

- [x] `src/lib/bots/types.ts`: `BotManifest` (id, name, username ending in
      `bot`, description, version, commands, requested permissions, entry
      point / gateway URL), `BotPermissions` (read messages, send messages,
      edit, delete, inline keyboard, media, mention-only), `BotCommand`
      (`{command, description}`), inline keyboard button
      `{text, callback_data | url | web_app}` with `callback_data` ≤ 64 bytes.
- [x] One button format only (the old repo had two incompatible ones — do not
      repeat that). Documented in `types.ts`.
- [x] Update types: `Update` union = `message | edited_message |
      callback_query | my_chat_member` (`inline_query` later, with Phase B7).
- [x] Unit tests for type guards and the 64-byte callback limit
      (`src/lib/bots/types.test.ts`, byte-length checks included).

### Phase B1 — Local bot runtime, L1 (1 week) — ✅ Done (2026-11-19)

- [x] `src/lib/bots/runtime.ts`: `BotContext` with `onUpdate`, `sendMessage`,
      `editMessage`, `deleteMessage`, `answerCallbackQuery`, `setCommands`.
      Module loading (`import()` of a bot entry point) is deferred to B3 —
      the runtime takes any installed-bot record.
- [x] Permission gate: every context call is checked against the granted
      `BotPermissions` (deny by default, `PermissionDeniedError`); mention-only
      bots receive only commands, mentions and callback queries.
- [x] Storage: `EncryptedBotStorage` persists the registry through the
      encrypted settings store (`saveSetting`/`loadSetting` in
      `src/lib/storage/db.ts`) and drops structurally invalid rows on load;
      `InMemoryBotStorage` covers tests.
- [x] Echo-bot example under `examples/bots/echo/` used as the test fixture
      (runtime tests + its own test).
- [x] Tests: permission matrix, callback round-trip, corrupt-registry
      handling, mention-only filtering.
- [ ] Sandboxed webview CSP check — deferred to B3 (module loading).

### Phase B2 — Chat UX for bots (1 week) — 🟡 Partial (2026-11-19)

- [x] Inline keyboard rendered from the message itself (`msg.botKeyboard` in
      `ChatMessage`), one component `src/components/MessageInlineKeyboard.tsx`
      with the anti-phishing long-press disclosure; pressing a button routes
      through `ChatScreen.onBotCallback` → `BotSession.dispatchCallback`
      (`src/lib/bots/session.ts`), wired in `App.tsx`.
- [x] i18n: `chat.botBadge`, `chat.startBot`, `chat.botCommands`,
      `chat.callbackToast` added to all 20 locales (`npm run audit:i18n`
      green).
- [ ] Bot badge in the chat list and chat header.
- [ ] "Start" button and `nova://bot/<id>?start=…` deep link.
- [ ] Command menu (`/` in the composer) listing `bot.commands`.
- [ ] Bot message delivery into the chat transcript (currently the sink
      records messages; rendering them in the conversation lands with the
      encrypted MessageSink integration in B4).
- [ ] Typing indicator for bots.

### Phase B3 — Bot management UI (3–4 days)

- [ ] Settings → Bots: list installed/local bots, install from
      `nova://bot/...` link or local file, permission screen at install time
      (explicit consent per permission), revoke/reinstall, delete.
- [ ] Local "Bot registry" screen for developers: create a local bot manifest,
      generate its keypair in the vault, rotate/revoke. Keys are generated
      on-device and never leave it — this is the L1 analogue of the old
      client-side `CreateBotModal`, but without any token-containing-a-key.

### Phase B4 — Gateway transport, L2 (1–1.5 weeks)

- [ ] The bot-as-participant joins via the existing transports: WebRTC
      DataChannel (`roomChannel.ts`) when on the same mesh, or the
      store-and-forward relay (`httpRelay.ts`) otherwise. The gateway is just
      another device running `P2PManager` headlessly
      (`packages/bot-gateway/`, a small Node package reusing `src/lib/p2p`).
- [ ] Bot prekey bundles are exchanged the same way peer bundles are
      (`refreshPeerBundle` path in `p2pManager.ts`), so the bot's key-change
      journal (`src/lib/security/peerKeyJournal.ts`) covers bots for free.
- [ ] Group support: privacy mode (default: commands and mentions only) is
      enforced client-side before an update is delivered; Sender Keys
      rotation on bot removal reuses `groupManager.ts`.
- [ ] Tests: bot joins a 1:1 and a group chat over the in-memory transport,
      key-rotation journal fires on bot bundle change, removal triggers
      sender-key rotation.

### Phase B5 — Telegram-shaped HTTP surface, L3 (1 week, gateway-side only)

- [ ] `packages/bot-gateway` exposes `POST /bot<token>/sendMessage`,
      `getUpdates` (long-poll + offset), `setWebhook`/`deleteWebhook`,
      `getMe`, `answerCallbackQuery`, `setMyCommands` — same JSON shapes as
      Telegram so grammY/telegraf/aiogram work after a base-URL change.
- [ ] Webhook delivery reuses the patterns already proven in the old repo's
      design and in this repo's server: HMAC signature, timestamp window,
      replay guard, retry with exponential backoff (cf. `server.js` IPN
      handler and the hardening in fix-roadmap F3).
- [ ] SSRF guard for `webhook_url`: https only, private/loopback ranges
      denied, re-validated after DNS resolution and on redirects.
- [ ] Rate limits: ~30 msg/s per bot, 1 msg/s per chat (Telegram-like).
- [ ] Contract tests against a fake Telegram client (grammY in a test) +
      fuzz the update parser (`vitest` + seeded fuzz like
      `src/lib/anon/fuzz.test.ts`).

### Phase B6 — System bot "NovaFather" (3–4 days)

- [ ] Implemented as an ordinary L1 bot on the same `BotContext` API:
      `/newbot` (local L1 manifest), `/setcommands`, `/setdescription`,
      `/token` (gateway tokens, hash-stored, shown once), `/revoke`,
      `/setwebhook`, `/setgateway` (attach an L2 gateway URL).
- [ ] Doubles as the end-to-end test of the whole API.

### Phase B7 — Mini Apps (deferred; 1 week when scheduled)

- [ ] `postMessage` bridge: `ready`, `close`, main button, theme params,
      `initData` signed with the bot identity key.
- [ ] iframe `sandbox="allow-scripts allow-forms"` — **no `allow-same-origin`**
      (the old repo's flaw); host on a separate origin registered by the bot
      owner; `frame-src` allowlist in the CSP in `index.html`.
- [ ] `web_app` button type becomes available; `inline_query` update type.

### Phase B8 — Security review & release (1 week)

- [ ] Threat model addendum in `docs/threat-model.md`: malicious bot requesting
      broad permissions, phishing via inline buttons (button text vs action
      shown in a long-press disclosure), token leak, SSRF, spam bots, spam
      resistance interaction with `src/lib/anon/spam.ts`.
- [ ] Report/block a bot; permission changes require re-consent; verified
      badge reserved for a future manual process (do not fake it).
- [ ] E2E test (Playwright): install echo bot → `/start` → keyboard renders →
      callback round-trip → revoke.
- [ ] Feature flag `NOVA_BOTS` (default on for L1, off for gateway pieces)
      so the app ships unchanged if bots are compiled out — consistent with
      the monetization track's "must work fully with the feature off" rule.

## 4. Ordering and dependencies

```text
B0 → B1 → B2 → B3            (L1 complete: local bots, ~3 weeks)
B1 → B4                      (gateway transport)
B4 → B5 → B6                 (L2/L3 complete, +2.5 weeks)
B7 any time after B2         (deferred)
B8 after each tier it gates
```

B0–B3 are pure client work with no new servers and no new network calls —
they can proceed even while fix-roadmap F1.1-class work is pending. B4
depends on stable `P2PManager` bundle/transport APIs. B5 depends on B4 only.

## 5. What NOT to port from the old repository

- Token containing the private key (`bot:<id>_<fp>_<priv>`) and bot key
  generation in the browser.
- Bots stored only in IndexedDB unencrypted.
- Two different inline-button formats (`action` vs `data`/`url`).
- Empty stubs (`getInlineKeyboard` returning `[]`, no-op
  `handleInlineButton`).
- `sandbox="allow-scripts allow-forms allow-same-origin"` on Mini App iframes.

## 6. Success metrics

- A developer can ship a working L1 bot with zero network access and zero
  servers, installing it from a file or `nova://bot/...` link.
- A chat with a bot is indistinguishable from any other chat in the crypto
  layer: same ratchet, same key journal, same sender-key rotation.
- An L3 bot written with grammY runs unmodified against a self-hosted Nova
  gateway except for the base URL.
- With `NOVA_BOTS` compiled out, the app makes no bot-related calls and no
  bot code paths execute.

## 7. Explicitly out of scope

- A hosted/central bot platform operated by the project (violates the
  "no extra servers for core functionality" constraint).
- Server-side bot message routing or storage on `mess.cvr.name`.
- Bot access to contact lists, presence of other users, or analytics.
- Ads inside bots (see the monetization track's guardrails; rewarded ads in
  mini-apps belong to monetization Phase C and inherit its rules).
