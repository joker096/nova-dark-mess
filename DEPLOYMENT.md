# 🚀 Nova Dark Messenger — Deployment Guide

Сборка и публикация мобильных версий (Android + iOS) через **Tauri 2.x**.

> ⚠️ **Важно:** iOS-сборку (IPA) нельзя собрать на Windows/Linux — требуется **macOS + Xcode**. Android (AAB/APK) собирается на Windows.

---

## 📋 Содержание
1. [Требования к системам](#требования-к-системам)
2. [Виртуальные устройства для превью](#виртуальные-устройства)
3. [Подпись приложений](#подпись-приложений)
4. [Порядок деплоя (скрипты)](#порядок-деплоя)
5. [Защита секретов (защита от утечек)](#защита-секретов)
6. [Требования Google Play](#требования-google-play)
7. [Требования Apple App Store](#требования-apple-app-store)
8. [CI/CD (GitHub Actions)](#cicd-github-actions)
9. [Чек-лист перед релизом](#чек-лист-перед-релизом)

---

## 1. Требования к системам

### Android (Windows / macOS / Linux)

| Инструмент | Версия | Назначение |
|------------|--------|------------|
| **JDK** | 17 или 21 | Сборка Gradle / подпись AAB |
| **Android SDK** | Command-line tools | `sdkmanager`, `adb` |
| **Android NDK** | r25+ | Компиляция Rust кода Tauri |
| **ANDROID_HOME** | — | Путь к Android SDK |
| **Tauri CLI** | 2.x | `npx tauri android build` |
| **Keystore (.jks)** | — | Подпись release AAB (Google Play требует подпись) |

**Установка SDK (Windows):**
```powershell
# Скачать Android Command-line Tools с developer.android.com
# Распаковать в %LOCALAPPDATA%\Android\Sdk
setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"
# Установить компоненты
%sdkmanager% "platform-tools" "platforms;android-34" "build-tools;34.0.0" "ndk;25.1.8937393"
```

### iOS (ТОЛЬКО macOS)

| Инструмент | Версия | Назначение |
|------------|--------|------------|
| **macOS** | 13+ (Ventura+) | ОС для Xcode |
| **Xcode** | 15+ | iOS SDK, симулятор, компиляция |
| **Apple Developer Program** | $99/год | Подпись, TestFlight, App Store Connect |
| **CocoaPods** | 1.12+ | Зависимости iOS |
| **Tauri CLI** | 2.x | `npx tauri ios build` |

> На Windows iOS-сборка **невозможна**. Используйте GitHub Actions с `macos-latest` runner или локальный Mac.

---

## 2. Виртуальные устройства для превью

### Android Emulator (работает на Windows)

Установка через Android Studio:
1. Открыть **Android Studio** → **Device Manager**
2. **Create device** → выбрать телефон (например, Pixel 7, Samsung Galaxy S23)
3. Системный образ: **API 34 (Android 14)**, x86_64
4. Запустить эмулятор

Проверка сборки на эмуляторе:
```powershell
# Установить отладочный APK на запущенный эмулятор
adb install dist\android\NovaDarkMessenger-1.0.0-debug.apk
```

### iOS Simulator (только macOS)

Уходит в комплект Xcode:
1. Открыть **Xcode** → **Open Developer Tool** → **Simulator**
2. Выбрать устройство (iPhone 15, iPhone 15 Pro Max, iPad Air)
3. Или через терминал:
   ```bash
   xcrun simctl list devices
   xcrun simctl boot "iPhone 15"
   ```

**Разрешения экрана для скриншотов маркетов:**
| Устройство | Разрешение | Где нужно |
|------------|-----------|-----------|
| iPhone SE | 375×667 | App Store (обязательно) |
| iPhone 12/13/14/15 | 390×844 | App Store |
| iPhone 15 Pro Max | 430×932 | App Store |
| iPad Air | 820×1180 | App Store (планшет) |
| Pixel 7 | 1080×2400 | Google Play |
| Samsung S23 | 1080×2340 | Google Play |

---

## 3. Подпись приложений

### Android (AAB)

Google Play Console принимает **только подписанный AAB**.

```powershell
# 1. Создать keystore (если нет)
keytool -genkeypair -v -keystore nova-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias nova

# 2. Собрать signed AAB
.\scripts\deploy-android.ps1 -Version 1.0.0 -Channel release `
  -KeystorePath .\nova-upload.jks `
  -KeystorePassword <пароль> `
  -KeyAlias nova `
  -KeyPassword <пароль_ключа>
```

### iOS (IPA)

Требует Apple Developer Program:
1. В Apple Developer Console создать **App ID** (`com.nova.messenger`)
2. Создать **Distribution Certificate** и **Provisioning Profile** (App Store)
3. Скачать профиль и установить в Xcode
4. Собрать: `npx tauri ios build --release`

---

## 4. Порядок деплоя (скрипты)

Все скрипты в `scripts/`:

| Скрипт | Назначение |
|--------|------------|
| `deploy-android.ps1` | Сборка Android AAB/APK + ченджлог |
| `deploy-ios.ps1` | Сборка iOS IPA (macOS) + ченджлог |
| `release-notes.ps1` | Запись changelog в `RELEASE_NOTES.md` |
| `publish-landing.js` | Пакет + деплой промо-лендинга на корень сайта (`mess.cvr.name`) |

### Промо-лендинг (корень сайта)

`npm run deploy:landing` → `node scripts/publish-landing.js`

1. **Проверка** — все локальные asset-ссылки в `index.html` существуют, все `lang/*.json` и `releases/releases.json` валидный JSON.
2. **Стадируем** `landing-deploy/` — копия `landing/` + `server.js` + `package.json` (отдельный пакет `mess-anger-landing`) + `.env.example`.
3. **Деплой** (`--deploy user@host` или `LANDING_HOST` env): scp бандла на хост, `npm install --production` + `pm2 restart mess-landing` (или `npm start` в фоне).
4. **Проверка** — `GET /` (index.html), `GET /releases/releases.json`, `GET /api/health`, `POST /api/paymento/ipn`.

Требования на хосте: Node.js 18+, `PORT` (по дефолту 8080), `PAYMENTO_SECRET` (HMAC-секрет от PaymentO для подписи IPN), Nginx/reverse-proxy с TLS до `mess.cvr.name`.

**Пример релиза Android:**
```powershell
.\scripts\deploy-android.ps1 -Version 1.0.1 -Channel release `
  -KeystorePath .\nova-upload.jks `
  -KeystorePassword **** `
  -KeyAlias nova `
  -KeyPassword ****
```

**Пример релиза iOS (на Mac):**
```powershell
.\scripts\deploy-ios.ps1 -Version 1.0.1 -Channel release
```

**Ченджлог** автоматически записывается в `RELEASE_NOTES.md` с датой, версией, платформой и каналом.

---

## 5. Защита секретов (защита от утечек)

Пароли и ключи **никогда не должны попадать в репозиторий**. Защита в 4 слоя:

| Слой | Механизм | Где |
|---|---|---|
| 1. Git-игнорирование | `.env*` (кроме `!.env.example`), `*.jks`, `*.keystore`, `receipts/` | `.gitignore` |
| 2. Локальный pre-commit | `scripts/check-secrets.js` сканирует staged-файлы на секреты; блокирует commit | `scripts/setup-git-hooks.js` (авто через `npm install` → `prepare`) |
| 3. CI-сканер | `gitleaks` в `ci.yml` — блокирует PR при секрете в diff | `.github/workflows/ci.yml`, `.gitleaks.toml` |
| 4. Push Protection (GitHub) | Блокирует push на стороне GitHub (включить вручную) | Settings → Security → Push protection |

**Куда кладутся секреты:**

| Секрет | Локально | В CI |
|---|---|---|
| Android keystore (path, store/key password, alias) | `.env` (не коммитится) + env для `deploy-android.ps1` | GitHub Secrets: `ANDROID_KEYSTORE_PATH/PASSWORD/ALIAS/KEY_PASSWORD` |
| PaymentO (API key, secret, IPN HMAC) | `.env` (не коммитится) | GitHub Secrets (серверный деплой) |
| Cloudflare (account id, API token) | `.env` (не коммитится) | GitHub Secrets (CF Pages/Workers) |
| Apple (team id, certs, provisioning) | macOS Keychain | GitHub Secrets: `TEAM_ID`, `APPLE_ID` (+ P12) |

**Локально секреты берутся из env** — скрипты **не содержат** паролей в коде. `deploy-android.ps1` читает `$env:KEYSTORE_PASSWORD` / `$env:KEY_PASSWORD`; `deploy-ios.ps1` — параметры из CI.

> ⚠️ **Если секрет уже закоммичен** — считать его **утёкшим** и **перевыпустить** (rotate), даже если затем удалить из git.

---

## 6. Требования Google Play

| Элемент | Требование |
|---------|------------|
| **Аккаунт** | Google Play Console (регистрация $25 один раз) |
| **Формат** | Android App Bundle (.aab) для релиза |
| **Подпись** | Play App Signing (обязательно для новых приложений) |
| **Целевой SDK** | targetSdkVersion 34 (Android 14) |
| **Минимальный SDK** | minSdkVersion 24 (Android 7.0) |
| **Иконка** | 512×512 PNG, без прозрачности, Adaptive Icon |
| **Скриншоты** | Минимум 2, телефон 7-дюймовый или меньше |
| **Политика конфиденциальности** | Обязательная ссылка (внутри приложения и в консоли) |
| **Data Safety** | Заполнить раздел в консоли (данные, которые собирает приложение) |
| **Возрастной рейтинг** | Заполнить опросник (IARC) |

**Текст политики конфиденциальности** должен включать:
- Какие данные собираются (ключи шифрования, идентификатор устройства, история чатов локально)
- Где хранятся (только локально на устройстве, localStorage, зашифрованная БД)
- Передаются ли данные третьим лицам (нет, P2P/WebRTC напрямую между пользователями)

---

## 7. Требования Apple App Store

| Элемент | Требование |
|---------|------------|
| **Аккаунт** | Apple Developer Program ($99/год) |
| **Формат** | .ipa через Xcode / Transporter / App Store Connect API |
| **Минимальная версия iOS** | 15.0 |
| **Иконка** | 1024×1024 PNG (App Store Connect) |
| **Скриншоты** | iPhone 6.5", 5.5", iPad Pro (обязательно для каждого размера экрана) |
| **Политика конфиденциальности** | Обязательная ссылка (App Review проверит) |
| **App Tracking Transparency** | Если собираете IDFA — добавить запрос разрешения |
| **Ключевые слова** | До 100 символов для поиска |
| **Описание** | До 4000 символов, первые 1-2 строки видны без "Читать ещё" |

**App Review критически важные моменты для мессенджера:**
1. **Пользовательский контент** — должен быть механизм репорта/блокировки пользователей
2. **Детская безопасность** — если приложение для 17+, указать в опроснике
3. **Криптография** — E2E шифрование (X3DH/Double Ratchet) требует ответа на вопрос об использовании шифрования (ERI — Export Compliance)
4. **Вход в систему** — если требуется аккаунт, предоставить тестовые учётные данные для проверяющего Apple

---

## 8. CI/CD (GitHub Actions)

Для iOS-сборки на Windows используется **macOS runner** в GitHub Actions.

### `.github/workflows/android.yml`

```yaml
name: Android Build

on:
  push:
    tags: ['v*']

jobs:
  build-android:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
      - name: Install Android SDK
        run: |
          # установить cmdline-tools, platform-tools, ndk через sdkmanager
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --run
      - run: .\scripts\deploy-android.ps1 -Version ${{ github.ref_name }} -Channel release
        env:
          KEYSTORE_PATH: ${{ secrets.ANDROID_KEYSTORE_PATH }}
          KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
      - uses: actions/upload-artifact@v4
        with:
          name: android-aab
          path: dist/android/*.aab
```

### `.github/workflows/ios.yml`

```yaml
name: iOS Build

on:
  push:
    tags: ['v*']

jobs:
  build-ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --run
      - run: .\scripts\deploy-ios.ps1 -Version ${{ github.ref_name }} -Channel release
      - uses: actions/upload-artifact@v4
        with:
          name: ios-ipa
          path: dist/ios/*.ipa
```

---

## 9. Чек-лист перед релизом

- [ ] `npm run lint` проходит без ошибок
- [ ] `npm test -- --run` все тесты зелёные
- [ ] `npm run build` собирает `dist/` без предупреждений критичных
- [ ] Версия в `tauri.conf.json` и `Cargo.toml` совпадает
- [ ] Ченджлог записан в `RELEASE_NOTES.md`
- [ ] **Никаких секретов в репозитории**: `.env`, `*.jks`/`*.keystore`, `receipts/` не в `git status` (см. §5)
- [ ] `gitleaks` / pre-commit хук прошли без находок (см. §5)
- [ ] Все секреты, которые были в коде ранее, перевыпущены (rotate)
- [ ] Android: AAB подписан own keystore (не debug)
- [ ] iOS: Provisioning Profile активен, сертификат Distribution установлен
- [ ] Политика конфиденциальности опубликована (ссылка в консоли маркета)
- [ ] Скриншоты для всех требуемых размеров экранов подготовлены
- [ ] Тестовое сообщение в чате проходит на реальном устройстве (не только эмулятор)
- [ ] Уведомления push (если есть) настроены в консоли маркета
- [ ] Возрастной рейтинг определён (обычно 17+ для мессенджеров с пользовательским контентом)

---

## 10. Файлы артефактов

После успешного деплоя в `dist/`:

```
dist/
├── android/
│   ├── NovaDarkMessenger-1.0.0.aab       # для Google Play
│   └── NovaDarkMessenger-1.0.0.apk        # для тестирования
└── ios/
    └── NovaDarkMessenger-1.0.0.ipa        # для TestFlight / App Store
```

RELEASE_NOTES.md автоматически обновляется при каждом запуске `release-notes.ps1`.
