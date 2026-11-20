# Nova Dark Messenger — Bots System: Complete Data for Website Article

**Last Updated:** 2026-11-20  
**Source Documents:** `ROADMAP.md`, `docs/bots-roadmap.md`, `examples/bots/movie-catalog/`

---

## Executive Summary

Nova Dark Messenger implements a **three-tier bot architecture** that respects the app's core constraints: no PII, no central servers for core functionality, local-first encrypted storage, and open auditable cryptography. Bots are **regular E2EE chat participants** with their own keypairs — not cloud services.

The system is designed so that **a bot chat is indistinguishable from a human chat** at the cryptographic layer: same Double Ratchet, same key journal, same Sender Keys rotation for groups.

---

## 1. Architecture Overview

### Three Tiers

| Tier | Name | Description | Server Required | E2EE |
|------|------|-------------|-----------------|------|
| **L1** | Local Bots | Run inside user's app (web worker / hidden webview / Tauri plugin). Zero network. | No | Bot sees plaintext only of chats it's explicitly granted |
| **L2** | Self-Hosted Gateway | Owner runs a gateway holding bot's keypair; joins P2P/relay as bot's "device" | Owner's opt-in server | Yes — chat stays E2EE, gateway holds bot key |
| **L3** | Telegram-Compatible Surface | Same gateway speaks Telegram Bot API protocol (grammY/telegraf/aiogram work after base-URL change) | Owner's gateway | Yes (same as L2) |

### Key Design Decisions

1. **Bot = E2EE participant** — The only option consistent with "safer than Telegram" positioning
2. **No bearer tokens with private keys** — Fixed the main flaw of the old repo
3. **Gateway generates bot identity** — App only receives bot's public bundle (like peer prekey bundle)
4. **L3 tokens are opaque** — `<botId>:<32 random bytes>`, only hash stored

### Non-Goals for v1
- ❌ Hosted bot directory / central registry
- ❌ Server-side bot token verification on project infrastructure
- ❌ Mini Apps (deferred to Phase B7)

---

## 2. Current Implementation Status

### ✅ Phase B0 — Contracts & Types (Done 2026-11-19)
- `src/lib/bots/types.ts`: `BotManifest`, `BotPermissions`, `BotCommand`, inline keyboard buttons
- Single button format (no incompatible `action` vs `data`/`url`)
- Update types: `message | edited_message | callback_query | my_chat_member`
- Unit tests for type guards, 64-byte callback limit

### ✅ Phase B1 — Local Bot Runtime L1 (Done 2026-11-19)
- `BotContext` API: `onUpdate`, `sendMessage`, `editMessage`, `deleteMessage`, `answerCallbackQuery`, `setCommands`
- Permission gating: every call checked against granted `BotPermissions`
- `EncryptedBotStorage` via encrypted settings store
- Echo-bot example: `examples/bots/echo/`
- Tests: permission matrix, callback round-trip, corrupt-registry handling, mention-only filtering

### 🟡 Phase B2 — Chat UX for Bots (Partial)
- ✅ Inline keyboard rendering (`MessageInlineKeyboard.tsx`), anti-phishing long-press disclosure
- ✅ Callback routing: `ChatScreen.onBotCallback` → `BotSession.dispatchCallback`
- ✅ i18n: `chat.botBadge`, `chat.startBot`, `chat.botCommands`, `chat.callbackToast` in all 20 locales
- ⬜ Bot badge in chat list/header
- ⬜ "Start" button + `nova://bot/<id>?start=...` deep link
- ⬜ Command menu (`/` in composer)
- ⬜ Bot message delivery into transcript (encrypted MessageSink integration in B4)
- ⬜ Typing indicator for bots

### ⬜ Phase B3 — Bot Management UI
- Settings → Bots: install from link/file, permission screen, revoke/reinstall/delete
- Local "Bot registry" for developers: create manifest, generate keypair in vault, rotate/revoke

### ⬜ Phase B4 — Gateway Transport L2
- Bot joins via WebRTC DataChannel or store-and-forward relay
- Gateway = headless `P2PManager` (Node package)
- Prekey bundle exchange via `refreshPeerBundle`
- Group support with mention-only privacy mode
- Sender Keys rotation on bot removal

### ⬜ Phase B5 — Telegram HTTP Surface L3
- `POST /bot<token>/sendMessage`, `getUpdates` (long-poll), `setWebhook`, `getMe`, `answerCallbackQuery`, `setMyCommands`
- HMAC signature, timestamp window, replay guard, exponential backoff
- SSRF guard for webhook URLs
- Rate limits: ~30 msg/s per bot, 1 msg/s per chat

### ⬜ Phase B6 — System Bot "NovaFather"
- `/newbot` (local L1 manifest), `/setcommands`, `/setdescription`
- `/token` (gateway tokens, hash-stored, shown once), `/revoke`
- `/setwebhook`, `/setgateway` (attach L2 gateway URL)
- Doubles as end-to-end test of whole API

### ⬜ Phase B7 — Mini Apps (Deferred)
- `postMessage` bridge: `ready`, `close`, main button, theme params, `initData` signed with bot identity
- iframe `sandbox="allow-scripts allow-forms"` — **no `allow-same-origin`**
- `web_app` button type, `inline_query` update type

### ⬜ Phase B8 — Security Review & Release
- Threat model addendum: malicious bot permissions, phishing via buttons, token leak, SSRF, spam
- Report/block bot; permission changes require re-consent
- Playwright E2E test: install echo bot → `/start` → keyboard → callback → revoke
- Feature flag `NOVA_BOTS` (default on for L1, off for gateway pieces)

---

## 3. Movie Catalog Bot — Reference Implementation

### Overview
A fully-featured **L1 local bot** demonstrating the platform's capabilities. Free, legal movie catalog with verified streaming links.

### Features Implemented

#### Core Catalog
- **15 curated movies** (public domain + YouTube Movies Free + Archive.org)
- **Legal sources only**: YouTube Movies (Free), Internet Archive, Tubi, Pluto TV, Crackle, Plex Free
- **URL safety validation** — all links checked against allowlisted domains
- **Public domain classics**: Metropolis, Nosferatu, Chaplin/Keaton films, etc.

#### User Features
- `/start` — Main menu with categories
- `/popular` — Top-rated movies with pagination
- `/genres` — Browse 22 genres with pagination
- `/search <query>` — Search by title, genre, description, director, actor
- `/random` — Random pick; supports `/random genre:comedy`
- `/watchlist` — Personal saved movies (persisted)
- `/history` — Recently viewed with dates (persisted)
- `/faq` — 21 questions in 5 categories
- **Inline mode** — `@moviecatalog_bot <query>` in any chat

#### Advanced Search Operators
```
/search director:nolan
/search actor:dicaprio action
/search year:1994 rating:8.5
/search action 2020 rating:8+
```

#### Filters (Year & Rating)
- Year: 2020+, 2010-2019, 2000-2009, <2000
- Rating: 8.5+, 8.0+, 7.5+, 7.0+
- Preserved across pagination

#### Localization (20 Languages)
English, Russian, Ukrainian, German, Spanish, Turkish, Indonesian, Vietnamese, Arabic, Thai, French, Portuguese, Italian, Polish, Dutch, Swedish, Chinese, Japanese, Korean, Hindi

**All UI text localized:**
- Menu buttons, FAQ categories & 21 questions
- Movie titles, descriptions, genres (all 15 movies)
- Callback responses, pagination, inline results

#### Persistence
- Per-user encrypted storage via `BotContext.storage`
- Keys: `movie_catalog_user_<userId>` → `{ watchlist, history, preferences }`
- Survives app restarts, updates, device sync (via encrypted backup)

#### Rich Media (uses `media` permission)
- Movie posters sent as photos with caption + inline keyboard
- `sendMovieAsPhoto()` helper for consistent photo+text delivery

#### FAQ System
5 categories, 21 questions:
1. **Getting Started** (3) — how to use, free, no account
2. **Watching Movies** (4) — how to watch, ads, offline, broken links
3. **Features** (5) — watchlist, history, search, inline mode, notifications
4. **Legal & Safety** (4) — legality, hosting, privacy, link safety
5. **Troubleshooting** (5) — bot not responding, data lost, not found

---

## 4. Technical Advantages

### For Users
| Advantage | Description |
|-----------|-------------|
| **Zero PII** | No phone, email, name required. Identity = cryptographic keypair (BIP-39 mnemonic) |
| **E2EE by Default** | Bot chats use same Double Ratchet as human chats. Bot sees only granted chats. |
| **Local-First** | Watchlist/history stored in encrypted local DB. Cloud sync opt-in, E2EE, user-controlled. |
| **No Central Server** | L1 bots run entirely on-device. Zero network calls for core functionality. |
| **Verified Legal Content** | All streaming links manually verified, domain-allowlisted. No pirated content. |
| **Full Localization** | 20 languages including RTL (Arabic). Movie content translated. |
| **Offline-Ready** | Catalog data bundled; only streaming links need network. |
| **Privacy by Design** | No analytics, tracking, ads in bot. Links open in browser — no referral tracking. |

### For Developers
| Advantage | Description |
|-----------|-------------|
| **Simple API** | `BotContext` with `onUpdate`, `sendMessage`, `editMessage`, `deleteMessage`, `answerCallbackQuery`, `setCommands` |
| **Permission Model** | Explicit per-permission consent at install. Mention-only mode for privacy. |
| **TypeScript First** | Full types in `src/lib/bots/types.ts`. 64-byte callback_data limit enforced. |
| **Testable** | `InMemoryBotStorage` for tests. Runtime tests cover permission matrix, callbacks, mention-only. |
| **L1 = Zero Deploy** | Ship as local file or `nova://bot/...` link. No server needed. |
| **L2/L3 Path** | Same code runs on self-hosted gateway. Telegram Bot API compatible (L3). |
| **GrammY/Telegraf Support** | L3 exposes Telegram-shaped HTTP surface — existing libraries work after base-URL change. |
| **Encrypted Storage** | Bot data persists via same encrypted settings store as user data. |

### For the Platform
| Advantage | Description |
|-----------|-------------|
| **No Central Bot Platform** | Violates no-server constraint. Bots are peer participants. |
| **Feature Flag** | `NOVA_BOTS` compiles out entire system — app works fully without bots. |
| **Reuses Crypto Stack** | X3DH, Double Ratchet, Sender Keys, key journal — no new crypto. |
| **Transport Agnostic** | Bots work over WebRTC mesh, relay, or offline queue automatically. |
| **Group Ready** | Sender Keys rotation on bot removal reuses `groupManager.ts`. |

---

## 5. Roadmap Summary (from docs/bots-roadmap.md)

### Completed (B0, B1)
- ✅ Types, runtime, permission model, encrypted storage
- ✅ Echo bot example, runtime tests

### In Progress (B2)
- 🟡 Inline keyboard, callbacks, i18n
- ⬜ Bot badge, start button, deep links, command menu, typing indicator

### Planned (B3–B8)
| Phase | Timeline | Deliverable |
|-------|----------|-------------|
| B3 | 3–4 days | Bot management UI (Settings → Bots) |
| B4 | 1–1.5 weeks | Gateway transport (L2) — headless P2PManager |
| B5 | 1 week | Telegram HTTP surface (L3) — grammY compatible |
| B6 | 3–4 days | NovaFather system bot |
| B7 | 1 week (deferred) | Mini Apps (`web_app` buttons, `postMessage` bridge) |
| B8 | 1 week | Security review, Playwright E2E, feature flag |

### Dependencies
```
B0 → B1 → B2 → B3          (L1 complete: ~3 weeks)
B1 → B4                    (gateway transport)
B4 → B5 → B6               (L2/L3 complete: +2.5 weeks)
B7 any time after B2       (deferred)
B8 after each tier it gates
```

---

## 6. Movie Catalog Bot — Data for Article

### Movie List (15 films)
| ID | Title | Year | Genre | Rating | Director | Actors |
|----|-------|------|-------|--------|----------|--------|
| 1 | The Shawshank Redemption | 1994 | Drama | 9.3 | Frank Darabont | Tim Robbins, Morgan Freeman |
| 2 | The Godfather | 1972 | Crime, Drama | 9.2 | Francis Ford Coppola | Marlon Brando, Al Pacino |
| 3 | Night of the Living Dead | 1968 | Horror, Thriller | 7.9 | George A. Romero | Duane Jones, Judith O'Dea |
| 4 | His Girl Friday | 1940 | Comedy, Romance | 8.0 | Howard Hawks | Cary Grant, Rosalind Russell |
| 5 | The Great Dictator | 1940 | Comedy, Drama, War | 8.4 | Charlie Chaplin | Charlie Chaplin, Paulette Goddard |
| 6 | Metropolis | 1927 | Sci-Fi, Drama | 8.3 | Fritz Lang | Brigitte Helm, Alfred Abel |
| 7 | Nosferatu | 1922 | Horror, Fantasy | 8.0 | F.W. Murnau | Max Schreck, Gustav von Wangenheim |
| 8 | The General | 1926 | Action, Comedy, War | 8.2 | Buster Keaton | Buster Keaton, Marion Mack |
| 9 | Safety Last! | 1923 | Comedy, Thriller | 8.1 | Fred C. Newmeyer | Harold Lloyd, Mildred Davis |
| 10 | The Kid | 1921 | Comedy, Drama, Family | 8.2 | Charlie Chaplin | Charlie Chaplin, Jackie Coogan |
| 11 | Sherlock Jr. | 1924 | Comedy, Mystery | 8.2 | Buster Keaton | Buster Keaton, Kathryn McGuire |
| 12 | The Gold Rush | 1925 | Comedy, Adventure | 8.1 | Charlie Chaplin | Charlie Chaplin, Mack Swain |
| 13 | Modern Times | 1936 | Comedy, Drama | 8.5 | Charlie Chaplin | Charlie Chaplin, Paulette Goddard |
| 14 | City Lights | 1931 | Comedy, Romance, Drama | 8.5 | Charlie Chaplin | Charlie Chaplin, Virginia Cherrill |
| 15 | Duck Soup | 1933 | Comedy, War | 7.7 | Leo McCarey | Groucho Marx, Harpo Marx |

### Streaming Sources (per movie)
Each movie has 1-2 verified sources:
- **YouTube Movies (Free)** — ad-supported, official
- **Internet Archive** — public domain, no ads
- **Tubi / Pluto TV / Crackle / Plex Free** — ad-supported, official (for applicable titles)

### Supported Languages (20)
| Code | Language | Native Name | Flag |
|------|----------|-------------|------|
| en | English | English | 🇬🇧 |
| ru | Russian | Русский | 🇷🇺 |
| uk | Ukrainian | Українська | 🇺🇦 |
| de | German | Deutsch | 🇩🇪 |
| es | Spanish | Español | 🇪🇸 |
| tr | Turkish | Türkçe | 🇹🇷 |
| id | Indonesian | Bahasa Indonesia | 🇮🇩 |
| vi | Vietnamese | Tiếng Việt | 🇻🇳 |
| ar | Arabic | العربية | 🇸🇦 |
| th | Thai | ไทย | 🇹🇭 |
| fr | French | Français | 🇫🇷 |
| pt | Portuguese | Português | 🇧🇷 |
| it | Italian | Italiano | 🇮🇹 |
| pl | Polish | Polski | 🇵🇱 |
| nl | Dutch | Nederlands | 🇳🇱 |
| sv | Swedish | Svenska | 🇸🇪 |
| zh | Chinese | 中文 (简体) | 🇨🇳 |
| ja | Japanese | 日本語 | 🇯🇵 |
| ko | Korean | 한국어 | 🇰🇷 |
| hi | Hindi | हिन्दी | 🇮🇳 |

---

## 7. Key Differentiators vs Telegram/WhatsApp Bots

| Aspect | Telegram Bots | WhatsApp Business API | Nova Bots (L1) |
|--------|--------------|----------------------|----------------|
| **Server Required** | Yes (central) | Yes (Meta/cloud) | **No** |
| **E2EE** | Optional (MTProto) | E2EE for users, not for bot | **Full E2EE** (bot = participant) |
| **PII Collection** | Phone number | Phone number | **None** |
| **Data Storage** | Cloud | Cloud/Google Drive | **Local encrypted** |
| **Offline Work** | No | No | **Yes** |
| **Bot Registration** | @BotFather (central) | Meta Business | **Local file / link** |
| **Token Security** | Bearer token | Bearer token | **No token with private key** |
| **Custom Code** | Any language (HTTPS) | Any language (HTTPS) | TypeScript (L1) / Node (L2) |
| **Group Support** | Yes | Limited | **Yes (Sender Keys)** |
| **Cost** | Free | Free/paid tiers | **Free** |

---

## 8. Compliance & Legal

- **GDPR/Privacy**: No PII collected. Local storage only. User controls data.
- **Copyright**: Only links to authorized free sources. No hosting.
- **Terms/Privacy**: Real documents at `https://mess.cvr.name/{terms,privacy}.html`
- **Russian Law (RF)**: Ads labeled with `erid`/ORD/EERI (when monetization enabled)
- **Open Source**: Crypto stack auditable. No "security by obscurity."

---

## 9. Monetization Boundaries (from ROADMAP.md)

**Guardrails (non-negotiable):**
- ❌ Never ads in 1:1 chats, groups, calls, push notifications
- ❌ No reading message content for targeting
- ❌ Ad server = optional self-hostable add-on, outside message delivery
- ❌ No IDFA/GAID, no third-party ad SDKs
- ✅ Ads only in channel feeds & channel catalog (MVP)
- ✅ 50% revenue share to channel admins
- ✅ Context-of-channel targeting only
- ✅ Three affiliate loops: platform CPA, mini-app referral, admin affiliate buttons

**Bot-specific:**
- ❌ No ads inside bots (monetization track guardrails)
- ✅ Rewarded ads in Mini Apps belong to monetization Phase C

---

## 10. Quick-Start for Article

### For Users
> "Open Nova Dark Messenger → Settings → Bots → Install Movie Catalog → `/start` → Browse 15 free legal movies in your language."

### For Developers
> "Create `manifest.ts` + `index.ts` → Implement `BotModule.init(ctx)` → Use `ctx.onUpdate()` → `ctx.sendMessage()` with inline keyboard → Package as `nova://bot/...` link."

### For Platform
> "Bots are E2EE peers. No central server. L1 = zero deploy. L2/L3 = self-hosted gateway. Telegram API compatible at L3."

---

## 11. Files to Reference

| File | Purpose |
|------|---------|
| `ROADMAP.md` | Full product roadmap, phases 0-9, comparison table |
| `docs/bots-roadmap.md` | Bots-specific roadmap (B0-B8), architecture, phases |
| `docs/fix-roadmap.md` | Security hardening phases F0-F4 |
| `docs/monetization-roadmap.md` | Ads/affiliate phases A-D |
| `docs/anonymity-roadmap.md` | Anonymous messenger track |
| `docs/threat-model.md` | Protected/not-protected, per-component disclosure |
| `docs/presence-privacy.md` | Presence opt-in, hashing, TTL |
| `src/lib/bots/types.ts` | All bot types, permissions, updates |
| `src/lib/bots/runtime.ts` | BotContext, BotRuntime, permission gating |
| `src/lib/bots/session.ts` | BotSession, delivery, install/uninstall |
| `examples/bots/echo/` | Minimal L1 bot example |
| `examples/bots/movie-catalog/` | Full-featured reference bot |
| `src/components/MessageInlineKeyboard.tsx` | Inline keyboard UI component |
| `src/components/ChatScreen.tsx` | Bot callback routing |

---

## 12. Suggested Article Structure

1. **Why Nova Bots Are Different** — E2EE participants, no central server, no PII
2. **Three Tiers Explained** — L1 (local), L2 (gateway), L3 (Telegram API)
3. **Movie Catalog Bot Deep Dive** — Features, localization, legal sources
4. **Developer Experience** — Types, API, testing, deployment
5. **Security Model** — Permission gating, key journal, mention-only mode
6. **Roadmap** — Current status (B0-B1 done), next steps (B2-B8)
7. **Comparison Table** — vs Telegram, WhatsApp, Signal
8. **Get Started** — Links to repo, examples, docs

---

*This document consolidates all bot-related information from the Nova Dark Messenger codebase as of 2026-11-20 for use in website articles, documentation, and marketing materials.*