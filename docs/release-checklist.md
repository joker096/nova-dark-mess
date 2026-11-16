# Release Checklist — Nova Dark Messenger

Use this checklist for every `v*` release.

## 1. Pre-flight (local)
- [ ] `git status` clean; on `agent-sharing-to-chats-5a5a` or release branch.
- [ ] `npm ci`
- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
- [ ] `npm run audit:i18n`
- [ ] `npx vitest run`
- [ ] `npm run build`
- [ ] Secret scan clean (`scripts/check-secrets`).

## 2. Version & changelog
- [ ] Bump version in `package.json`, `src-tauri/tauri.conf.json`, `Cargo.toml`.
- [ ] Update `RELEASE_NOTES.md` with user-facing changes.
- [ ] Update `ROADMAP.md` "Last updated" date.

## 3. Backend / landing (requires SSH access)
- [ ] `npm run deploy:landing` (stages bundle) — review `landing-deploy/`.
- [ ] `LANDING_HOST=... LANDING_SSH_KEY=... node scripts/publish-landing.js --deploy`
- [ ] Register PaymentO IPN URL in store settings.
- [ ] Verify `https://mess.cvr.name/health`, terms, privacy URLs.
- [ ] PM2 `mess-api` (user0) restarted and healthy.

## 4. Mobile CI
- [ ] Run `Android E2E (emulator)` workflow on the commit (`workflow_dispatch`).
- [ ] iOS build (`ios.yml`) green.
- [ ] Deep link `nova://chat/...` verified on a real device.

## 5. Tag & publish
- [ ] `git tag v<version>` and push tag.
- [ ] Confirm CI artifacts (AAB/APK/IPA) uploaded.
- [ ] Smoke test: install, onboarding, send message, premium checkout.

> Step-by-step AAB build instructions (manual dispatch, tag, gh CLI, local):
> see `docs/deploy-aab.md`.

## 6. Post-release
- [ ] Monitor server logs / PM2 for errors.
- [ ] Check crash reports / user feedback.