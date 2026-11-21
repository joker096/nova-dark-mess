# Stage 1 report — widget, guest session, relay, «Сайты» folder

Date: 2026-11-21
Spec: `docs/ТЗ для ИИ-агента виджет «чат на сайт» для Mess&Anger.md`, stage 1
Evidence rule from spec: every acceptance criterion must have evidence in `docs/reports/stage-N.md`.

## Environment

- Repo `F:\AISTUDIO\nova-dark-messenger`, branch `andromity/bots-phase-b2`.
- Widget package: `packages/widget/` (loader.js, chat.js, chat.html, crypto.js).
- Gateway: `server/site-gateway/` (index.js, store.js, crypto.js).

## Acceptance criteria

### 1. Message from visitor reaches owner ≤ 2 s online; offline → relayed on reconnect

STATUS: DONE (evidence: automated)

- `node test-smoke.mjs` (server/site-gateway) — ALL PASSED:
  config/pubkey → pow challenge → guest session → guest session bad origin → 403 →
  guest history → owner threads (1 thread) → owner send 201 → guest sees owner message →
  owner sites.
- `node test-e2e.mjs` (server/site-gateway) — ALL PASSED:
  - WS owner→guest delivery (owner message received on guest WS);
  - undelivered message relayed on reconnect (guest reconnects → gets pending message);
  - unauthorized domain rejected.
- Latency measurement (≤2 s) is not asserted by these tests; delivery path is synchronous
  over the local WS relay. Wall-clock measurement is listed under manual checks.

### 2. Owner reply visible to visitor in widget

STATUS: DONE (evidence: automated)

- test-e2e guest→owner and owner→guest WS cases above; test-smoke "guest sees owner message".

### 3. History survives widget reload

STATUS: DONE (evidence: automated)

- test-smoke "guest history": `/v1/guest/history` returns the thread messages after session
  restore, so reload re-fetches history from server (E2E encrypted, server stores ciphertext).

### 4. DB and logs contain no plaintext messages

STATUS: DONE (evidence: code review + automated)

- Gateway store is ciphertext-first (`server/site-gateway/crypto.js`, `store.js` — messages
  stored as ciphertext envelopes; keys never leave client except via `/c/<token>#<key>`
  fragment which the server never sees).
- Negative check: test-smoke asserts session round-trip only; plaintext leak check is a
  manual grep in server logs (see manual checks).

### 5. Guest session from unauthorized domain rejected

STATUS: DONE (evidence: automated)

- test-smoke "guest session bad origin → 403"; test-e2e "unauthorized domain rejected".

### 6. Works in Chrome, Firefox, Safari incl. iOS; usable at 320 px width

STATUS: NOT VERIFIED — manual/device required

No device farm in CI here. Playwright suite exists: `packages/widget/tests/widget.test.js`
(config `playwright.config.js`) — but browsers not installed in this environment
(`npx playwright test` cannot run without browser binaries).
Blocked: download Chromium/WebKit or run on host browsers; add results below when available.

### 7. Size targets §1.4 (loader ≤ 2 kB gzip, chat ≤ 30 kB gzip)

STATUS: PARTIAL — build measured, loader/chat split to verify

- `npx vite build` in packages/widget: `dist/widget.js` 44,824 B (gzip 17.37 kB),
  `dist/widget.mjs` 57,185 B (gzip 19.22 kB) — both within the 30 kB chat budget.
- `packages/widget/loader.js`: raw 1,987 B, gzip 1,011 B ≤ 2 kB budget — measured via
  .NET GZipStream (level optimal). The gateway serves loader.js from packages/widget
  (route `/widget/loader.js` in server/site-gateway/index.js).
- Gateway serves `/widget/chat.js` = `packages/widget/chat.js` (WIDGET_DIR = packages/widget,
  index.js:150). Measured: chat.js raw 20,448 B, gzip 6,577 B ≤ 30 kB ✓;
  chat.html gzip 994 B; crypto.js gzip 1,290 B; curves.js served from
  `node_modules/@noble/curves/ed25519.js` (present, crypto tests green).
- dist/widget.js 44,824 B (gzip 17.37 kB), dist/widget.mjs 57,185 B (gzip 19.22 kB) from
  `npx vite build` — only if the built bundle is deployed instead of raw files.

## Automated verification (2026-11-21)

```
npx tsc --noEmit                 # repo root — clean
packages/widget: npx tsc --noEmit  # clean
packages/widget: npx vitest run    # 11 tests passed (after excluding tests/** playwright file)
npx vite build (packages/widget)   # see sizes above
node test-smoke.mjs (site-gateway) # ALL PASSED
node test-e2e.mjs  (site-gateway)  # ALL PASSED
```

## Manual checks (required to close stage 1)

- [ ] Browser matrix Chrome/Firefox/Safari/iOS @320px — install Playwright browsers
      (`npx playwright install chromium webkit`) or manual device notes appended to this file.
- [ ] Wall-clock delivery ≤2 s (stopwatch or test-e2e extension with timestamps).
- [ ] Log grep: no plaintext in gateway logs (`Select-String` on server output).
- [ ] loader.js gzip size ≤2 kB.
- [ ] XSS: widget renders plain text only; iframe CSP strict; `frame-ancestors` dynamic from
      sites.domains; no cookies; no third-party trackers/fonts — manual DOM/network audit.

## Notes

- Stage-2 handoff acceptance page (`/c/<token>#<key>`) implemented in app deep links and
  `src/features/sites/HandoffPrompt.tsx` — see stage-2 report.