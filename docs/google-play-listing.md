# Google Play Console — данные для публикации (copy-paste готово)

Приложение: **Nova Dark Messenger**
Package ID: `com.messanger.e2e` (debug-сборки: `com.messanger.e2e.debug`)
Версия на момент подготовки: 1.0.49 · versionCode задаёт Tauri/Gradle автоматически.
AAB собирается через `scripts/deploy-android.ps1 -Version <x.y.z> -Channel release`
(нужны `KEYSTORE_PASSWORD` / `KEY_PASSWORD` из `.env`, см. android.yml).

**Подпись (важно).** Play принимает только upload-ключ с отпечатком
SHA1 `5E:1B:A8:21:E0:80:EE:36:C8:27:FE:CE:9E:83:59:F4:AC:46:90:E4`
(SHA256 `13:36:84:83:…:9F:86:3D`, alias `messandanger`, JKS). Его копия лежит в корне
проекта как `play-upload-key.jks`; пароль — `BUBBLEWRAP_KEYSTORE_PASSWORD` /
`BUBBLEWRAP_KEY_PASSWORD` из `.env` (в старом проекте `F:\AISTUDIO\neumorphic-ui`,
тот же alias `messandanger`).

Файл `messandanger-keystore.jks` в корне — **другой ключ** (SHA1 `9F:95:4B:75:…:BF:F1`, PKCS12),
им подписывать нельзя: Play отклонит загрузку с ошибкой «неправильный ключ».
Переподпись готового бандла:

```bash
jarsigner -keystore play-upload-key.jks -sigalg SHA256withRSA -digestalg SHA-256 \
  dist/android/NovaDarkMessenger-<ver>.aab messandanger
keytool -printcert -jarfile dist/android/NovaDarkMessenger-<ver>.aab | grep SHA1   # должно быть 5E:1B:…
```

---

## 1. Основной листинг (Store listing)

**App name** (до 30 символов):
```
Nova Dark Messenger
```

**Short description** (до 80 символов, en-US):
```
Encrypted P2P messenger with no phone number: keys, not identities. No servers.
```

**Full description** (до 4000 символов, en-US):
```
Nova Dark Messenger is a privacy-first messenger built on a simple idea: your
identity is a cryptographic key, not a phone number.

NO PII, NO SIM, NO CONTACTS UPLOAD
• Register with a self-generated keypair (BIP-39 seed phrase you keep)
• Find people by fingerprint, QR code or a nova:// invite link
• Human-readable handles derived from your public key — no central registry
• No phone numbers, emails or contact lists are ever requested or uploaded

END-TO-END ENCRYPTED, LOCAL-FIRST
• 1:1 chats secured by the Double Ratchet (X3DH + X25519 + AES-256-GCM)
• Group chats up to 50 members with Sender Keys encryption and re-keying
• Message history stays on your device in encrypted storage
• Sealed sender and optional metadata minimization resist traffic analysis
• Safety numbers, QR key verification and emoji fingerprints

EVERYTHING WORKS WITHOUT A SERVER
• Direct P2P transport over WebRTC DataChannels — LAN mesh, no signaling
• Optional thin stateless relay for store-and-forward when peers are offline
  (relays see only opaque encrypted blobs, 7-day TTL, no message content)
• Offline message queue: write now, deliver when a peer appears
• Push notifications replaced by in-app delivery over your own mesh

GROUPS, CHANNELS, COMMUNITIES
• Group chats with roles, admin tools and join approvals
• Invite links and QR invites with request/approve flow
• Broadcast channels with scheduled posts, comments and reactions
• Communities: a channel plus its discussion group, moderated locally

RICH MESSAGING
• Text, voice memos with waveform, photos, documents (chunked P2P transfer
  with SHA-256 integrity and resume), stickers and sticker packs
• Polls, location sharing and live location with geofencing
• Reactions, replies, threads, pinned messages, folders
• Disappearing messages, view-once media, scheduled messages
• Voice and video calls over WebRTC (P2P, no call server)
• Stories, multi-device sync by QR (encrypted history transfer)

PRIVACY & SECURITY CONTROLS
• App lock with PIN and TOTP-based 2FA
• Encrypted .nova-backup export/import, plus optional encrypted cloud backup
  to your own WebDAV/S3 endpoint — keys never leave the device
• Per-chat notification settings and sound choice
• Local analytics only — nothing is sent anywhere

Nova is open about its trade-offs: it deliberately excludes phone-number
registration, cloud message storage and third-party push services (FCM/APNs).
If you value ownership of your identity and your history, this is your
messenger.

Support: https://mess.cvr.name/
Source of truth for the crypto stack: X25519, Ed25519, AES-256-GCM,
Double Ratchet, X3DH — well-reviewed primitives only.
```

**Russian (ru-RU) short description:**
```
Шифрованный P2P-мессенджер без номера телефона: ключи вместо личностей.
```
**ru-RU full description** — переведите full description выше (структура 1:1);
заголовки блоков: «НИКАКИХ ЛИЧНЫХ ДАННЫХ», «СКВОЗНОЕ ШИФРОВАНИЕ, ЛОКАЛЬНО-ПЕРВЫЙ ПОДХОД»,
«ВСЁ РАБОТАЕТ БЕЗ СЕРВЕРА», «ГРУППЫ, КАНАЛЫ, СООБЩЕСТВА», «БОГАТЫЙ ОБМЕН СООБЩЕНИЯМИ»,
«КОНТРОЛЬ ПРИВАТНОСТИ И БЕЗОПАСНОСТИ».

---

## 2. Графика (графические ресурсы)

| Актив | Требование | Источник / как получить |
|---|---|---|
| App icon (512×512 PNG, 32-bit) | ≤1 МБ | ✅ готово: `play/icon-512.png` (512×512, непрозрачный, 25 КБ, из `src-tauri/icons/app-icon.png`) |
| Feature graphic 1024×500 | JPG/PNG 24-bit без альфы, без текста по краям | ✅ готово: `play/feature-graphic.png` (1024×500, 24-bit, тёмный фон #0b0c10, светлый логотип по центру) |
| Phone screenshots | min 2, рекомендовано 8; 16:9 или 9:16, 320–3840 px | ✅ готово 4 шт.: `play/screenshots/` (1080×1920 PNG, 9:16, ≤ 0.43 МБ): список чатов в папке Personal, чат с опросом/стикером/геолокацией, канал с календарём недели, настройки темы и Premium. Сняты с запущенного веб-слоя приложения в headless-браузере (эмулятор не понадобился) |
| 7" tablet screenshots | опционально | те же кадры с планшетного эмулятора |
| Promo video | опционально | YouTube-ссылка |

**Рекомендованные кадры скриншотов (в этом порядке):**
1. Список чатов (папки + stories) — главный экран.
2. Открытый чат с реакциями, reply и стикером.
3. Диалог ключей/QR (safety number + верификация).
4. Группа: участники, роли, приглашение по ссылке.
5. Канал/сообщество.
6. История/сторис.
7. Меш-карта (тёмная, с маркерами).
8. Настройки приватности (PIN/2FA/шифрование бэкапа).

Команда для съёмки: запустить debug-APK на эмуляторе,
`adb exec-out screencap -p > shotN.png` (портрет 1080×2340).

---

## 3. Классификация контента (Content rating questionnaire)

Ответы, дающие рейтинг **Everyone 3+** (IARC):
- Violence/фобии/насилие: нет.
- Sexual content: нет.
- Language: нет.
- Controlled substances: нет.
- User-generated content / обмен между пользователями: **ДА** — чат, группы, каналы.
  - Вопрос «Does your app allow sharing content?» → да, но: есть блокировка/удаление
    участниками, жалобы обрабатываются локально (нет серверного модератора по дизайну).
  - «Can users share location?» → да, по явному действию пользователя.
- Персональные данные собираются? → **Нет** (см. Data safety).
- Целевая аудитория: 13+ (мессенджер не адресован детям; выберите 18+/13+
  в разделе Target audience, но НЕ отмечайте «приложение для детей»).

---

## 4. Data safety (раздел «Данные о безопасности»)

Формулировки для консоли (en, переводы — ru):

| Вопрос консоли | Ответ |
|---|---|
| Does your app collect or share any of the required user data types? | **No, this app doesn't collect or share any user data** — если хотите подтвердить построчно, альтернатива ниже |
| Data collected: location? | Not collected (live location передаётся только другим участникам чата напрямую по их явному действию и не сохраняется/не отправляется разработчику) |
| Data collected: personal info (name, email, phone, address)? | **None** — регистрация без PII |
| Data shared with third parties? | **None** |
| Encryption in transit? | да (все данные E2EE/защищённые каналы) |
| Deletion request mechanism? | да: «Clear local encrypted data» в Settings + удаление бэкапа пользователем; нет серверных копий, удалять нечего |
| Data security practices: committed to Play Families Policy? | No (не детское приложение) |

Если консоль требует перечислить типы (когда нельзя ответить «No data»),
перечислите только:
- **App activity** (on-device analytics) — collected: No; shared: No; transient: да.
- **Files** (зашифрованный бэкап пользователя) — device-only, optional.

Ключевая декларация: приложение **не передаёт данные разработчику** —
вся сеть это P2P или пользовательский self-hosted relay; аналитика только локальная.

---

## 5. Разрешения (Permissions declaration)

В манифесте AAB заявлены только:
- `INTERNET` — P2P соединения и (опционально) тайлы OSM/backup endpoint.
- `CAMERA` — сканирование QR-кодов приглашений и верификация ключей (не обязательно: `required="false"`).
- `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS` — голосовые сообщения и звонки (не обязательно).

**Не используются** и поэтому не декларируются: `READ_CONTACTS`, `ACCESS_FINE_LOCATION`
(геолокация внутри WebView через getUserMedia по действию пользователя —
если в финальном AAB появится системный запрос гео, декларируйте
`ACCESS_FINE_LOCATION` с пометкой «in-app feature, user-initiated»), `READ_PHONE_STATE`,
`READ_SMS`, фоновые службы.

Для формы консоли:
- Camera: «通讯/QR invite scanning» — core feature.
- Microphone: «voice messages and calls» — core feature.
- Location: только по действию пользователя внутри WebView; объявить, если будете.

---

## 6. Прочие обязательные поля

| Поле | Значение |
|---|---|
| App category | Communication |
| Tags | `messaging`, `privacy`, `encrypted` |
| Contact email | (ваш email поддержки) |
| Contact phone / website | https://mess.cvr.name/ |
| Privacy policy URL | **обязателен**: опубликуйте страницу, например `https://mess.cvr.name/privacy` — текст ниже |
| Countries | по умолчанию все; исключите страны с блокировкой E2EE по вашему усмотрению |
| Release type | Production (первый релиз можно Internal testing → закрытый тест) |

### Черновик Privacy Policy (EN, выложить по постоянному URL)

```
Nova Dark Messenger Privacy Policy
Last updated: 2026-11-14

We do not collect personal information. Nova has no accounts on our servers:
your identity is a cryptographic keypair generated on your device. We never
receive your phone number, email, contacts or message content.

What stays on your device: your keypair and seed phrase, message history
(encrypted at rest), local analytics, sticker packs and settings.

What travels over the network: only encrypted message payloads between you
and the people you chat with (P2P), optional encrypted relay envelopes
(opaque blobs, auto-deleted after 7 days on the relay operator's storage),
map tiles from OpenStreetMap when online, and — only if you enable it — your
own encrypted backup uploaded to a WebDAV/S3 endpoint you choose.

Payments: the optional $3.90 / 30-day premium subscription is processed by
PaymentO. We store a PII-stripped receipt (no name, no email) and issue a
signed license key bound to the device solely to verify entitlement.

Children: Nova is not directed at children under 13.

Contact: (ваш email)
```

---

## 7. Порядок публикации

1. Собрать AAB: `.env` с ключами → `powershell -File scripts/deploy-android.ps1 -Version 1.0.49 -Channel release -SkipLint` (артефакт появится в `dist/android/`).
2. Play Console → Create app → заполнить листинг по §1, загрузить графику §2.
3. App content: content rating §3, data safety §4, permissions §5, privacy policy URL §6.
4. Первый прогон: **Internal testing** track → загрузить AAB → добавить 10–20 тестеров по email-списку → проверить установку, `nova://` deep link, камеру, микрофон.
5. Затем Production: полный rolling release.

### Чек-лист перед заливкой AAB
- [ ] `com.messanger.e2e` без `.debug` суффикса в release-сборке (проверить `applicationId` в `build.gradle` после сборки).
- [ ] Подписано upload-ключом `play-upload-key.jks` (SHA1 `5E:1B:…`), не `messandanger-keystore.jks` и не debug-ключом.
- [ ] `versionCode` увеличен относительно прошлой загрузки (Tauri ставит из `version`).
- [ ] Внутри AAB не попали secrets: `npm run check:secrets` + gitleaks в CI уже проверяют.
- [ ] Скриншоты сняты с реального билда, feature graphic без изношенного текста.
