# Bot Threat Model Addendum

## Overview
This document extends the main threat model (`docs/threat-model.md`) to cover the bot subsystem (phases B0–B8).

## Assets

| Asset | Classification | Description |
|-------|----------------|-------------|
| Bot identity keypairs | HIGH | Ed25519 signing + X25519 encryption keys |
| Bot manifest (commands, permissions) | MEDIUM | Public but integrity-protected |
| User bot state (watchlist, history) | MEDIUM | Encrypted local storage |
| Bot tokens (L3) | HIGH | HMAC-signed, hash-stored, shown once |
| Gateway URL | MEDIUM | Can redirect bot traffic |
| User messages to bots | MEDIUM | Same E2EE as human chats |

## Threats & Mitigations

### T1: Malicious Bot Permissions
**Threat:** Bot requests excessive permissions (`media`, `read_messages`).
**Mitigation:**
- Explicit per-permission consent at install time
- Mention-only mode for groups (only commands/mentions/callbacks delivered)
- Users can revoke per-permission later (requires re-consent)

### T2: Phishing via Inline Buttons
**Threat:** Bot sends buttons with malicious URLs or deceptive labels.
**Mitigation:**
- Long-press on button shows full URL/intent before action
- URL allowlist for streaming sources (movie catalog)
- `web_app` buttons restricted to same-origin iframe (no `allow-same-origin`)

### T3: Bot Token Leak
**Threat:** L3 token exposed in logs, client code, or webhook URLs.
**Mitigation:**
- Tokens are opaque: `<botId>:<32 random bytes>`
- Only SHA-256 hash stored server-side
- Shown once at generation; never in logs
- Revocable individually or all at once

### T4: SSRF via Webhook URLs
**Threat:** Attacker sets webhook to internal metadata endpoints.
**Mitigation:**
- Webhook URL validation: HTTPS only, no localhost/private IPs
- Optional secret token in `X-Telegram-Bot-Api-Secret-Token` header
- Rate limiting per bot (30 msg/s, 1 msg/s per chat)

### T5: Spam / Abuse
**Threat:** Compromised or malicious bot sends spam to users/groups.
**Mitigation:**
- Rate limiting at runtime (20 msg/s per bot)
- Mention-only mode limits group exposure
- Report/block bot UI in chat header
- Permissions can be reduced post-install

### T6: Supply Chain / Malicious Bot Code
**Threat:** Developer publishes malicious bot manifest/module.
**Mitigation:**
- L1 bots run in sandboxed context (no DOM, no network by default)
- Permission gating at runtime (every call checked)
- Local install from file/link — user audits manifest
- No central bot store (no supply chain attack surface)

### T7: Gateway Compromise
**Threat:** Self-hosted L2/L3 gateway is compromised.
**Mitigation:**
- Gateway holds bot identity but doesn't store private keys for other users
- Bot traffic is E2EE — gateway cannot read message content
- Self-hosted by bot owner — no central gateway to compromise

## Data Flow Summary

```
User → nova://bot/<id>?start=... → Deep link handler
  → Settings → Bots → Install from file/link
  → Manifest validated → Permissions consented
  → Bot registered in encrypted storage
  
Bot Runtime:
  ctx.sendMessage() → Permission check → MessageSink.send()
  → Local sink (L1) → ChatScreen renders
  → HttpMessageSink (L2/L3) → Gateway → P2P network
  
Gateway (L2/L3):
  BotGateway holds identity → P2PManager joins mesh
  HTTP API → Telegram Bot API compatible
  Webhook + Long-poll supported
```

## Residual Risks (Accepted)

| Risk | Likelihood | Impact | Note |
|------|------------|--------|------|
| User installs malicious bot from untrusted link | Low | Medium | User must explicitly consent to permissions; no auto-install |
| Bot token brute-forced | Very Low | High | 256-bit entropy; rate limited |
| Gateway operator reads metadata | Medium | Low | Traffic is E2EE; only timing/metadata visible |
| Bot permission escalation via re-consent bypass | Low | Medium | Re-consent required for new permissions |

## References
- Main threat model: `docs/threat-model.md`
- Bot roadmap: `docs/bots-roadmap.md`
- Bot runtime: `src/lib/bots/runtime.ts`
- Gateway: `packages/gateway/`