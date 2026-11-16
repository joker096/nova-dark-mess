# Nova Dark Messenger

Защищённый тёмный мессенджер с end-to-end шифрованием, каналами, историями и mesh-сетью.

## Возможности

- **E2E-шифрование** (X3DH + Double Ratchet) — только получатель может прочитать сообщение
- **Каналы** — создание, подписка, посты с отложенной публикацией, реакции
- **Истории** — 24-часовые истории с обложками и реакциями
- **Mesh-радаар** — визуализация узлов mesh-сети со статусом, задержкой и пропускной способностью
- **Папки чатов** — кастомные иконки (в т.ч. премиум), группировка чатов
- **Настройки** — темы, размер шрифта, уведомления, 2FA, шифрование бэкапа, очистка данных
- **Премиум** — подписка **$3.90 / 30 дней** через **PaymentO** (без криптовалюты и привязки карт в приложении): премиум-иконки папок, цвета сообщений, премиум-обои и стикерпаки
- **Локальное хранение** — всё хранится в `localStorage` на устройстве, ничего не уходит на внешние серверы

## Технологический стек

- React 19 + Vite + Tailwind CSS 4
- i18next (10 языков: en, ru, uk, de, es, tr, id, vi, ar, th)
- Tauri 2.x (обёртка под Android / iOS / десктоп)
- @noble/curves, @noble/hashes, @scure/bip39 — криптография

## Деплой мобильных версий

Все скрипты лежат в `scripts/`.

### Требования

| Платформа | Можно на Windows | Требуется |
|-----------|------------------|-----------|
| Android (AAB / APK) | ✅ Да | JDK 17/21, Android SDK (API 34, NDK), `ANDROID_HOME`, keystore для релиза |
| iOS (IPA) | ❌ Нет | Только **macOS + Xcode 15+**, Apple Developer Program ($99/год) |

### Сборка Android

```powershell
# Релизный AAB (для Google Play)
.\scripts\deploy-android.ps1 -Version 1.0.1 -Channel release `
  -KeystorePath .\nova-upload.jks `
  -KeystorePassword <пароль_keystore> `
  -KeyAlias nova `
  -KeyPassword <пароль_ключа>

# Отладочный APK
.\scripts\deploy-android.ps1 -Version 1.0.1 -Channel debug
```

### Сборка iOS (только на Mac)

```powershell
.\scripts\deploy-ios.ps1 -Version 1.0.1 -Channel release
```

На Windows iOS-сборка невозможна локально — используйте GitHub Actions (см. `.github/workflows/ios.yml`, runner `macos-latest`) или локальный Mac.

### Ченджлог

При каждом деплоё скрипт `release-notes.ps1` автоматически дописывает запись в `RELEASE_NOTES.md` с версией, датой, платформой и каналом.

### GitHub Actions

- `.github/workflows/android.yml` — Windows runner, теги `v*`
- `.github/workflows/ios.yml` — macOS runner, теги `v*`

Секреты для репозитория:
- `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
- `APPLE_ID`, `TEAM_ID`

## Преимущества перед другими мессенджерами

| Характеристика | Nova Dark Messenger | Типичные мессенджеры |
|----------------|---------------------|----------------------|
| Шифрование | E2E (X3DH + Double Ratchet), ключи на устройстве | Часто только доставка до сервера |
| Хранение данных | Только локально (`localStorage`), шифрованный бэкап | Облако производителя |
| Аккаунт | Не обязателен, работа без регистрации | Обязательный номер телефона |
| Каналы | Свои каналы с отложенными постами и реакциями | Ограниченные или платные |
| Mesh-сеть | Визуализация узлов, задержек, маршрутов | Нет |
| Премиум | Оплата через PaymentO ($3.90 / 30 дней), чек без PII | Подписка через карту/магазин |
| Визуальный стиль | Тёмная тема по умолчанию, акцентный оранжевый | Светлая/тёмная на выбор |
| Языки | 10 языков, включая ru/uk/ar/th | Обычно 3–5 основных |

## Виртуальные устройства для превью

**Android Emulator** (Windows/macOS/Linux):
- Android Studio → Device Manager → Create device (Pixel 7 / Galaxy S23)
- Системный образ: API 34 (Android 14), x86_64
- Проверка: `adb install dist\android\NovaDarkMessenger-<версия>-debug.apk`

**iOS Simulator** (только macOS):
- Xcode → Open Developer Tool → Simulator
- Устройства: iPhone 15, iPhone 15 Pro Max, iPad Air

## Скриншоты маркетов

Требуемые разрешения:
- iPhone SE: 375×667 (обязательно для App Store)
- iPhone 12–15: 390×844
- iPhone 15 Pro Max: 430×932
- iPad Air: 820×1180
- Pixel 7: 1080×2400 (Google Play)

## Разработка

```bash
npm install
npm run dev        # запуск на http://localhost:3000
npm run lint       # проверка типов
npm test           # прогон тестов (vitest)
npm run build      # production-сборка в dist/
npm run audit:i18n # аудит переводов
```

## Структура проекта

```
src/
  components/    React-компоненты (каналы, чаты, настройки, медиа-галерея, mesh-радар)
  context/       LanguageContext, SecurityContext
  hooks/         useSocialData, usePremium, useWheelScroll
  lib/           social (хранилище, посты, реакции), premium, crypto, ui
  locales/       i18n (en, ru, uk, de, es, tr, id, vi, ar, th)
  types/         messenger.ts (типы каналов, постов, историй, папок)
src-tauri/       Tauri-обёртка (Android, iOS, десктоп)
scripts/         deploy-android.ps1, deploy-ios.ps1, release-notes.ps1
.github/workflows/android.yml, ios.yml
```

## Лицензия

Частный проект. Распространение через Google Play и Apple App Store.
