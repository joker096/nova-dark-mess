# Nova Dark Messenger — Bots Roadmap

Last updated: 2026-11-19

This roadmap turns the bot-integration plan (derived from the audit of the old
`neumorphic-ui` messenger) into an implementable plan for **this** codebase.
Like `docs/anonymity-roadmap.md`, it is incremental: every phase ships with
tests and must not break the existing secure-messaging baseline.

**Implementation status:** B0–B8 are **implemented**. B6 has real bot
management (including `/newbot`) and honest gateway/token/webhook boundaries;
transport-level group E2E is still the main gap. B7 has an operator-controlled
Mini App origin allowlist wired into CSP and runtime. B8's security/release
checks passed on 2026-11-21 (full unit suite, i18n audit, security self-tests,
secret scan, production build and the bots E2E).

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
      `editMessage`, `deleteMessage`, `answerCallbackQuery`, `setCommands` and
      bot-scoped `storage`. Module loading is implemented: entry points are
      bundled via `import.meta.glob` (`echo`, `novafather`, `movie-catalog`)
      and `BotSession` loads them for every enabled, unblocked bot on init and
      whenever a runtime is rebuilt. `movie-catalog` was fixed to the current
      `BotContext` (bot-scoped storage, no inline-query branch) and now has a
      load/`/start` smoke test. The sandboxed-webview CSP check is still open.
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

### Phase B2 — Chat UX for bots (1 week) — ✅ Done (2026-11-20)

- [x] Inline keyboard rendered from the message itself (`msg.botKeyboard` in
      `ChatMessage`), one component `src/components/MessageInlineKeyboard.tsx`
      with the anti-phishing long-press disclosure; pressing a button routes
      through `ChatScreen.onBotCallback` → `BotSession.dispatchCallback`
      (`src/lib/bots/session.ts`), wired in `App.tsx`.
- [x] i18n: `chat.botBadge`, `chat.startBot`, `chat.botCommands`,
      `chat.callbackToast` added to all 20 locales (`npm run audit:i18n`
      green).
- [x] Bot badge in the chat list and chat header (`isBotChat` in
      `ChatsScreen.tsx`, bot profile/status in `ChatScreen.tsx`).
- [x] "Start" button and `nova://bot/<id>?start=…` deep link (settings Bots
      list opens the chat and sends `/start`; `App.tsx` handles `bot` targets).
- [x] Command menu (`/` in the composer) listing `bot.commands`.
- [x] Bot message delivery into the chat transcript: local sink renders bot
      output, edits and deletions; L2/L3 manifests use `HttpMessageSink`.
- [x] Typing indicator for bots (`botTyping` state driven by `sendTyping`).

### Phase B3 — Bot management UI (3–4 days) — ✅ Done (2026-11-20)

- [x] Settings → Bots: list installed/local bots, install from
      `nova://bot/...` link or local file, permission screen at install time
      (explicit consent per permission), revoke/reinstall, delete.
- [x] Local "Bot registry" screen for developers: create a local bot manifest,
      generate its keypair in the vault, rotate/revoke. Keys are generated
      on-device and never leave it — this is the L1 analogue of the old
      client-side `CreateBotModal`, but without any token-containing-a-key.

### Phase B4 — Gateway transport, L2 (1–1.5 weeks) — 🟡 Partial

- [x] The bot-as-participant joins via the existing transports: WebRTC
      DataChannel (`roomChannel.ts`) when on the same mesh, or the
      store-and-forward relay (`httpRelay.ts`) otherwise. The gateway is just
      another device running `P2PManager` headlessly
      (`packages/bot-gateway/`, a small Node package reusing `src/lib/p2p`).
- [x] Bot prekey bundles go through the same path as peer bundles:
      `P2PManager` gained an `onPeerBundle` hook that fires for every bundle
      the transport accepts (first sight and every replacement, including a
      refresh), whether the peer is a bot or a contact. `App.tsx` wires it to
      `observePeerKey`, so the key-change journal
      (`src/lib/security/peerKeyJournal.ts`) records bot key rotations for
      free. A throwing observer is reported via `onError` and never rejects
      the bundle.
- [x] Group support: frames travel in a versioned `__nova_group` envelope
      (`src/lib/p2p/groupWire.ts`, shared by client and gateway) over the same
      1:1 P2P session, so ordinary text is never mistaken for a group frame.
      `BotGateway.joinGroup/sendGroupMessage/addGroupMember/
      removeGroupMember/rotateGroupKey` drive a `GroupChatManager`, and
      SKDM/join-request callbacks reach `onGroupMessage`/
      `onGroupJoinRequest`. The client now addresses group frames to bot peers
      directly: a bot member is delivered over the encrypted 1:1 session instead
      of the room broadcast (`ChatScreen` keeps a per-group bot-peer roster,
      `nova_bot_group_peers`). The roster is populated only from real bot
      identities: NovaFather `/setpeer <bot> <fingerprint>` stores the gateway
      bot's mesh fingerprint in the encrypted registry, and adding/approving
      that fingerprint as a group member registers it for direct delivery;
      `syncBotGroupPeers` prunes uninstalled bots and members who left, so a
      human is never treated as a bot. Gateway privacy mode (`mentionOnly`, `botId`)
      filters small talk **after** decryption, so a bot in a group receives only
      commands and mentions while SKDM/role/join frames still get through —
      dropping an SKDM would leave the bot unable to read anything later.
- [x] Tests: `packages/bot-gateway/src/index.test.ts` covers the 1:1 relay,
      group join/SKDM/message exchange, removal (no further fan-out to the
      removed member), the own-echo rule and mention-only filtering;
      `src/lib/p2p/p2pManager.bundles.test.ts` proves the bundle hook fires on
      a bot key rotation and cannot reject a bundle;      `groupWire.test.ts` pins
      the envelope and the mention rule. Client-side roster registration and
      pruning are covered by `src/lib/bots/groupPeers.test.ts` and the
      ChatScreen group test; a full gateway-in-a-group E2E run is still open. Sender-key rotation on removal is
      covered by `groupManager.test.ts` and the gateway removal case.

### Phase B5 — Telegram-shaped HTTP surface, L3 (1 week, gateway-side only) — 🟡 Partial

- [x] `packages/bot-gateway` exposes `POST /bot<token>/sendMessage`,
      `getUpdates` (long-poll + offset), `setWebhook`/`deleteWebhook`,
      `getMe`, `answerCallbackQuery`, `setMyCommands` — same JSON shapes as
      Telegram so grammY/telegraf/aiogram work after a base-URL change.
- [x] Webhook delivery: HMAC-SHA256 signature plus the optional
      `X-Telegram-Bot-Api-Secret-Token`. Network errors and 5xx replies are
      retried up to 3 attempts with exponential backoff; 3xx is never followed
      and 4xx is not retried. Replay/timestamp windows belong to the receiver
      (the gateway sends no timestamp header), so the earlier claim of a
      built-in replay guard was wrong and is corrected here.
- [x] SSRF guard for `webhook_url`: https only; every DNS answer is checked
      against loopback/private/link-local/CGNAT/reserved IPv4 and IPv6 ranges at
      registration and again immediately before each delivery. Webhook fetches
      use `redirect: 'manual'`, so an HTTP redirect is never followed (a 3xx
      response is simply treated as a failed best-effort delivery). DNS is
      resolved again by the fetch itself, so pinning the checked address would
      still require a custom dispatcher — noted as a hardening follow-up.
- [x] Rate limits: ~30 msg/s per bot, 1 msg/s per chat (Telegram-like).
- [x] Contract tests against a fake Telegram client (grammY in a test) +
      fuzz the update parser (`vitest` + seeded fuzz like
      `src/lib/anon/fuzz.test.ts`). `packages/bot-gateway/src/http.test.ts`
      now drives a Telegram-shaped client through sendMessage/getUpdates/
      setWebhook/getMe/setMyCommands and fuzzes 30 deterministic malformed
      bodies against every endpoint, then checks the server is still healthy.

### Phase B6 — System bot "NovaFather" (3–4 days) — ✅ Done (2026-11-21)

- [x] Implemented as an ordinary L1 bot on the same `BotContext` API.
      Bot management is real: `manage_bots` is a normal requested permission,
      `BotAdminApi` exposes `listBots`/`setBotEnabled`/`uninstallBot` from
      `BotSession`, and NovaFather guards against disabling or deleting itself.
- [x] `/mybots` reads the installed registry rather than a chat-local list;
      enable/disable and delete therefore act on the bots the app actually has.
- [x] `/newbot` installs a real manifest instead of pretending: name →
      username → description → permissions → entry module, then
      `BotAdminApi.installBotFromDraft` (via `BotSession.installBotFromDraft`)
      validates the username with the same rule as `isValidBotUsername`, grants
      exactly the permissions the user toggled and registers the bot — so it
      appears in `/mybots` and Settings → Bots immediately. Creating the code
      module itself from chat is still out of scope (an L1 bot is a bundled
      module), and the flow says so instead of faking it.
- [x] `/setgateway` updates the installed manifest through
      `BotSession.setGatewayUrl` (a `none` value clears it and invalid URLs are
      rejected); the list refreshes from the registry afterwards.
- [x] `/setcommands` (validated JSON, max 100) and `/setdescription` update
      the installed manifest through `BotSession`.
- [x] `/token`, `/revoke` and `/setwebhook` no longer pretend to work: they
      explain that L3 tokens and webhooks are configured on the gateway
      (`botToken`, `setWebhook`), because the app never holds gateway secrets.
      The main-menu callbacks for these screens are wired too.
- [x] `src/lib/bots/novafather.test.ts` covers `/start`, `/mybots`, toggle,
      gateway, peer fingerprint, command-list updates and the `/newbot` install
      flow (including an invalid username) through `BotRuntime` + `BotAdminApi`;
      transport-level E2E is still missing.

### Phase B7 — Mini Apps — ✅ Done (2026-11-21)

- [x] `postMessage` bridge in `src/components/MiniAppIframe.tsx`: app→host
      `ready`/`close_requested`/`main_button_clicked`/`inline_query`; host→app
      `ready` with signed `initData` and theme params, `main_button`, `close`.
- [x] `initData` is HMAC-SHA256 signed with a per-install secret stored in the
      encrypted bot registry (`getWebAppSecret`), not with the bot id; old
      installs are backfilled. The app receives the signature, never the secret.
- [x] iframe uses `sandbox="allow-scripts allow-forms"` — **no
      `allow-same-origin`** — and only HTTPS URLs are accepted.
- [x] `frame-src` is restricted to an operator allowlist, not arbitrary
      `https:`.      Decision: Mini Apps live under an operator-controlled host, configured
      with `VITE_MINI_APP_ORIGINS=https://mini-apps.your-domain.com`, one path
      per bot, because CSP is document-wide and per-bot hosts cannot be
      expressed dynamically. `example.com` is a reserved placeholder, not a
      working host: there is no default domain and every remote Mini App is
      denied until the operator supplies their own. The allowlist feeds every CSP surface: `vite.config.ts`
      (browser build) and `src-tauri/tauri.conf.json`, whose `csp`/`devCsp`
      `frame-src` use the `{{MINI_APP_ORIGINS}}` placeholder that Tauri
      substitutes at build time. `MiniAppIframe` also refuses any URL whose
      exact origin is not listed
      (`src/lib/bots/miniAppOrigins.ts`). With no env value, every remote Mini
      App is denied and only `'self'`/`blob:` remain. Tests cover parsing,
      exact-origin matching and the refused iframe.
- [x] `web_app` button type opens the Mini App; `inline_query` updates are
      accepted by the runtime and routed from the bridge.

### Phase B8 — Security review & release (1 week) — ✅ Done (2026-11-21)

- [x] Threat model addendum in `docs/threat-model.md`: malicious bot requesting
      broad permissions, phishing via inline buttons (button text vs action
      shown in a long-press disclosure), token leak, SSRF, spam bots and
      local-only reports.
- [x] Report/block a bot; permission changes require re-consent; verified
      badge reserved for a future manual process (do not fake it). Blocking is
      persisted in the encrypted registry and checked before every
      update/callback; reports are local-only (`src/lib/bots/reports.ts`).
- [x] E2E test (Playwright): install echo bot → `/start` → keyboard renders →
      callback round-trip → revoke (`tests/bots.e2e.ts`). Verified on
      2026-11-21 against the local Vite app
      (`APP_URL=http://localhost:3000 npx e2e run tests/bots.e2e.ts`). The run
      caught two real bugs that are now fixed: bot replies never carried their
      inline keyboard, and the single global sink delivered replies to the
      hidden mobile ChatScreen instead of the visible one.
- [x] Feature flag `NOVA_BOTS` (default on; `VITE_NOVA_BOTS=false` disables
      it). With the flag off the app creates no bot session work, passes no
      session to Settings/ChatScreen (so the Bots UI is absent), ignores
      `nova://bot/...` deep links and routes no P2P traffic into bot runtimes.
      The flag is a runtime switch, not a compile-time removal — the docs no
      longer claim the code is tree-shaken out.
- [x] Release verification on 2026-11-21: `npm test` (162 files, 1302 tests),
      `npm run audit:i18n` (PASSED), `npm run test:security` (16/16),
      `npm run check:secrets` (clean), `npm run lint:eslint` (0 errors,
      46 existing warnings), `npm run build`, and the bots E2E (1/1). The
      outstanding gap is B4's live gateway-in-a-group E2E, not a unit or
      security failure.

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
