# Деплой iOS — Nova Dark Messenger

Сборка и публикация iOS (IPA) для App Store Connect. Выполняется **только на macOS** с Xcode 16+ (Apple Developer Program обязателен).

## Ошибка «16 КБ страницы памяти»

App Store Connect отклоняет новые iOS-сборки, не поддерживающие страницы памяти 16 КБ (требование Xcode 16 / iOS 18+, устройства на A18 Pro и новее, например iPhone 16 Pro).

**Исправление:** собирать IPA **только на Xcode 16+**. Никаких изменений в коде приложения не требуется — достаточно правильного Xcode и целевого iOS SDK. После `tauri ios init` проверьте в Xcode:
- **Signing & Capabilities** — команда, сертификат Distribution, Provisioning Profile.
- **Deployment Target** — не занижайте без необходимости.
- **Build Settings** — архитектура `arm64`, целевой iOS SDK актуальный.

## Требования

| Компонент | Минимум | Примечание |
|-----------|---------|------------|
| macOS | Ventura 13+ | Только Mac |
| Xcode | 16+ | Нужно для 16 КБ страниц памяти |
| Apple Developer Program | $99/год | Сертификат Distribution + профиль |
| App Store Connect | аккаунт | Загрузка и ревью сборки |

## Секреты GitHub Actions

Для CI-воркфлоу `.github/workflows/ios.yml` добавьте в репозиторий Secrets:

| Secret | Значение |
|--------|----------|
| `APPLE_ID` | Apple ID для App Store Connect |
| `TEAM_ID` | Team ID из Apple Developer porgram |

## Локальный деплой (Mac)

```bash
# 1. Перейти в корень репозитория
cd /путь/к/nova-dark-messenger

# 2. Инициализировать iOS-проект (однократно, требует macOS + Xcode)
npx tauri ios init

# 3. Проверить проект в Xcode
open src-tauri/gen/ios/*.xcodeproj
# В Xcode: Signing & Capabilities → команда, сертификат, профиль

# 4. Собрать Release-IPA
npx tauri ios build --release

# 5. IPA появится здесь:
# src-tauri/gen/ios/app/build/Release-iphoneos/Nova Dark Messenger.ipa

# 6. Загрузить в App Store Connect (Xcode Organizer / Transporter / API)
```

### Через PowerShell-скрипт (macOS)

```powershell
./scripts/deploy-ios.ps1 -Version 1.0.50 -AppleId $env:APPLE_ID -TeamId $env:TEAM_ID
```

Скрипт обновит версии в `src-tauri/tauri.conf.json` и `src-tauri/Cargo.toml`, прогонит lint + тесты, соберёт IPA и скопирует его в `dist/ios/`.

## CI-деплой (GitHub Actions)

Воркфлоу: `.github/workflows/ios.yml`. Запускается:
- при push-теге `v*`;
- вручную (`workflow_dispatch`) с вводом версии.

Собирается на `macos-latest`. После успешной сборки IPA загружается в артефакты GitHub Actions (`dist/ios/*`); финальная загрузка в App Store Connect выполняется вручную (Xcode Organizer / Transporter / App Store Connect API).

## Чек-лист перед деплоем

- [ ] macOS + Xcode 16+
- [ ] `npx tauri ios init` выполнен, `src-tauri/gen/ios/` существует
- [ ] Версии синхронизированы (`tauri.conf.json` + `Cargo.toml`)
- [ ] Xcode-проект подписан (Distribution сертификат + Provisioning Profile)
- [ ] Пройдены `npm run lint` и `npm test`
- [ ] IPA собран и загружен в App Store Connect без ошибки про 16 КБ страниц

## Связанные файлы

- `src-tauri/tauri.conf.json` — версия, идентификатор, iOS-секция (`minimumSystemVersion`)
- `src-tauri/Cargo.toml` — версия Rust-části
- `scripts/deploy-ios.ps1` — локальный скрипт сборки iOS
- `.github/workflows/ios.yml` — CI-сборка iOS на macOS
- `docs/android-ios-verification-plan.md` — план проверки Android/iOS
