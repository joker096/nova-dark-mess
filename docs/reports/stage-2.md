# Stage 2 — Handoff to messenger: evidence report (2026-11-21)

Spec: `docs/ТЗ для ИИ-агент виджет «чат на сайт» для Mess&Anger.md`, stage 2.
Verdict: implemented and verified by code review + automated tests. Items marked
"manual" need a human with a real browser/phone (Playwright browsers not installed).

## Acceptance criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 2.1 | Handoff link `/c/<token>#<key>` opens the conversation in the app; key travels in the URL fragment only | DONE | `landing/c.html` (token from `?token=`, key from `location.hash`), gateway `GET /v1/guest/handoff/:token/validate` + `POST /v1/guest/handoff/:token/consume`, app `src/features/sites/HandoffPrompt.tsx` (consume → `localStorage['nova_pending_site_handoff']`), deep-link parser accepts `https://<host>/c/<token>#<key>` for nova.app / mess.cvr.name (key ONLY from `location.hash`; `?key=` query yields no key). Hosts: `nova.app`, `mess.cvr.name`, `www.mess.cvr.name`, `DEEP_LINK_WEB_HOST` |
| 2.2 | Deep links `nova://site-handoff/<token>#<key>` and landing alias `nova://widget-handoff?token=#<key>` parse in the app | DONE | `src/lib/network/deepLinks.ts` (both scheme branches; token patterns `^[A-Za-z0-9_-]{16,256}$` / key `{16,512}$`), unit tests: 17/17 PASSED (`npx vitest run src/lib/network/deepLinks.test.ts`) |
| 2.3 | QR code on desktop to move the conversation to the phone | MANUAL | Not implemented as QR render in this sprint; landing page offers the same one-time link plus «Открыть в приложении» / store buttons / «Открыть в браузере» fallback (2s timeout). Flagged in `docs/reports/stage-2.md` TODO |
| 2.4 | Branding «Работает на Mess&Anger» visible inside the widget, `hide_branding` flag defaults to false | DONE | `packages/widget/chat.html` (branding block), `packages/widget/chat.js` (handoff section + `hide_branding`), `landing/privacy.html` + `landing/index.html` «Для сайтов» state default false |
| 2.5 | `site_stats_daily` metrics recorded: loaded / opened / first_message / owner_replied / handoff_shown / clicked / completed | DONE | `server/site-gateway/store.js:454-462` (row counters all 7), `POST /v1/stats/track` → `GET /v1/owner/stats`. HARDENING applied: unknown event names now rejected with 400 `STAT_EVENT_UNKNOWN` (previously any event name could create arbitrary counter fields) |
| 2.6 | Stats screen with 7/30-day view in the app | DONE | `src/features/sites/SitesScreen.tsx` (`statsDays` 7|30 toggle, `DailyStat` state, `t('sites.statsTitle')`) |
| 2.7 | Landing section «Для сайтов» linking to widget installation | DONE (this sprint) | Added `landing/index.html` section `#sites` + nav link + i18n keys in `landing/lang/ru.json`, `landing/lang/en.json` (JSON parse validated). Existing docs page: `landing/docs/widget.html` («Установка виджета чата», snippet `https://mess.cvr.name/widget/loader.js`) |
| 2.8 | `privacy.html` has a widget section | DONE (this sprint) | Added «Website chat widget» section to `landing/privacy.html` (no cookies, no third-party trackers, key stays in fragment, ciphertext-only relay, handoff opt-in, aggregate-only owner stats, PoW rate limits) and mirrored to `landing-deploy/landing/` (index + lang + privacy) |
| 2.9 | Widget i18n ru/en | DONE | `packages/widget` ru/en strings (stage 1) + landing ru/en keys added here |

## Verification commands

- `npx vitest run src/lib/network/deepLinks.test.ts` → 17/17 PASSED (includes site-handoff scheme,
  universal `/c/<token>#<key>`, key-only-in-fragment, bad token/host rejection, landing alias round-trip).
- `server/site-gateway`: `node test-smoke.mjs` ALL PASSED; `node test-e2e.mjs` ALL PASSED (re-run after
  stats whitelist change).
- `landing/lang/{ru,en}.json` (+ landing-deploy copies) — JSON parse OK.

## Manual checks still open (human, real devices)

1. Browser matrix: Chrome, Firefox, Safari, Safari/iOS, widget at 320 px width (Playwright suite exists:
   `packages/widget/tests/widget.test.js`, browsers not installed in CI).
2. Delivery ≤ 2 s stopwatch and offline-relay delivery by hand (covered by test-e2e for the relay path).
3. Log grep: server logs must contain no plaintext (stage-1 manual item).
4. Desktop QR render on the handoff page.
5. Browser-console check that the widget sets no cookies / no third-party requests.