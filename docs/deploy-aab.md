# Инструкция по деплою — сборка обновлённого AAB

Nova Dark Messenger · обновлено 2026-11-16

Как собрать и получить обновлённый `.aab` (Google Play) в любой момент.
Версию выбираете сами — она попадает и в имя файла, и в `versionName`/`versionCode`.

---

## Способ 1 — GitHub Actions вручную (без тега, из браузера)

Workflow `.github/workflows/android.yml` принимает `workflow_dispatch` с полями
`version` и `channel`, так что сборку можно запустить когда угодно.

1. Откройте: <https://github.com/joker096/nova-dark-mess/actions/workflows/android.yml>
2. Кнопка **«Run workflow»** (справа сверху).
3. Поля:
   - **version** — например `1.0.50`;
   - **channel** — `release` (подписанный AAB + APK) или `debug` (быстрый APK).
4. **Run workflow** → ждите ~15–20 минут.
5. На странице запуска, внизу, появится артефакт **`android-artifacts`** —
   внутри `NovaDarkMessenger-<версия>.aab` (и `.apk`).

## Способ 2 — GitHub CLI из консоли (одна команда в любой момент)

Разово: закоммитить и запушить текущие изменения (если ещё не сделано):

```powershell
git add -A
git commit -m "Security hardening: PQ handshake, Argon2id backups, relay-only ICE, presence privacy"
git push
```

Затем в любой момент — новая версия и сборка:

```powershell
$VERSION = "1.0.51"          # ← поменяйте на нужную
git commit --allow-empty -m "release: v$VERSION"
git push
gh workflow run android.yml -f version=$VERSION -f channel=release
gh run watch                  # прогресс (Ctrl+C не прерывает сборку)
```

Скачать готовый AAB:

```powershell
gh run download --name android-artifacts --dir dist\android
```

Если `gh` не установлен: `winget install GitHub.cli`, затем `gh auth login`.

## Способ 3 — тег (классический релиз)

Пуш тега `v*` тоже триггерит сборку:

```powershell
$VERSION = "1.0.50"
git commit --allow-empty -m "release: v$VERSION"
git push
git tag v$VERSION
git push origin v$VERSION
```

Версия берётся из имени тега (`v1.0.50` → `1.0.50`).

## Способ 4 — локальная сборка (без CI)

Скрипт сам читает `src-tauri/gen/android/keystore.properties` (gitignored);
явные параметры или `ANDROID_KEYSTORE_*` / `KEYSTORE_*` перекрывают его.
Перед сборкой скрипт выставляет `CARGO_TARGET_*_LINKER`/`CC_*` на NDK-clang —
иначе cargo на Windows берёт первый `cc` из PATH (MinGW) и падает с
`ld.exe: unrecognized option '--eh-frame-hdr'`.

```powershell
# 1. Ключ уже есть и он единственный: play-upload-key.jks (alias messandanger).
#    Создавать новый НЕЛЬЗЯ — Play его не примет.

# 2. Собрать (lint + тесты + подпись включены)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-android.ps1 -Version 1.0.51 -Channel release
```

Результат: `dist\android\NovaDarkMessenger-1.0.51.aab` (+ APK).
Быстрая сборка без проверок: добавить `-SkipTests -SkipLint`.

Скрипт проверяет, что AAB подписан **тем же** ключом, что указан в
`keystore.properties`/`ANDROID_KEYSTORE_PATH`, и отказывается молча
переподписывать релиз другим ключом.

### Ключ, который принимает Play (важно)

Play привязывает загрузки к SHA-1 `5E:1B:A8:21:E0:80:EE:36:C8:27:FE:CE:9E:83:59:F4:AC:46:90:E4`
(alias `messandanger`, файл `play-upload-key.jks` в корне репозитория).
Это ЕДИНСТВЕННЫЙ keystore в проекте — других ключей нет, и создать «запасной»
нельзя: Play отклонит любой AAB с другим ключом до тех пор, пока не будет
выполнен upload key reset в Play Console.

- `keystore.properties` указывает именно на него (`storeFile=../../../play-upload-key.jks`).
- Скрипт падает с понятной ошибкой, если выбран не Play-ключ; обойти можно только
  осознанно — `-AllowKeyChange` (и только после upload key reset в Play Console).
- Если `play-upload-key.jks` потерян — восстановите его из резервной копии.
  НЕ запускайте `keytool -genkeypair`: новый ключ Play не примет.

Переподписать уже собранный AAB правильным ключом:

```powershell
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore play-upload-key.jks `
  -storepass $env:KEYSTORE_PASSWORD -keypass $env:KEY_PASSWORD `
  dist\android\NovaDarkMessenger-<ver>.aab messandanger
keytool -printcert -jarfile dist\android\NovaDarkMessenger-<ver>.aab   # SHA1 = 5E:1B:…:90:E4
```

---

## Перед сборкой: быстрые проверки

### Поддержка 16-КБ страниц Android

Приложение содержит Rust shared library. Для NDK r27 флаги 16-КБ ELF
выравнивания задаются в `.cargo/config.toml` для всех Android ABI. Не удаляйте
эти настройки при смене NDK; Android NDK r28+ включает выравнивание по
умолчанию. Скрипт релизной сборки проверяет `LOAD`-сегменты каждой `.so` в AAB
и прерывает выпуск, если встречается выравнивание меньше 16 КБ.

Android Gradle Plugin 9.3.1 обеспечивает 16-КБ выравнивание shared libraries
в bundle. Для ручной проверки конфигурации AAB используйте `bundletool dump
config --bundle=<файл.aab>` и убедитесь, что указано `PAGE_ALIGNMENT_16K`.

Официальная инструкция: <https://developer.android.com/guide/practices/page-sizes>.

```powershell
npm run lint         # tsc — должен быть чист
npm run test         # на 2026-11-16: 743 теста / 95 файлов, зелёные
npm run build        # vite-сборка фронтенда
npm run audit:i18n   # паритет 20 локалей — PASSED
```

Полный чеклист релиза: `docs/release-checklist.md`.

## Требования CI (один раз проверить)

Settings → Secrets and variables → Actions:

| Secret | Обязателен | Что внутри |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | да (release) | base64 всего `.jks` — CI раскодирует его в `$RUNNER_TEMP` |
| `ANDROID_KEYSTORE_PASSWORD` | да | пароль хранилища |
| `ANDROID_KEY_ALIAS` | да | alias upload-ключа (`upload` для нового ключа) |
| `ANDROID_KEY_PASSWORD` | да | пароль ключа |
| `ANDROID_KEYSTORE_PATH` | нет | только если `.jks` реально существует на runner |

`ANDROID_KEYSTORE_PATH` из GitHub Secrets не может указывать на файл,
которого нет на runner. Поэтому основной вариант — base64:

```powershell
[Convert]::ToBase64String(
  [IO.File]::ReadAllBytes("play-upload-key.jks")
) | Set-Clipboard
```

Вставьте результат в `ANDROID_KEYSTORE_BASE64`. Не коммитьте `.jks`,
`keystore.properties` и пароли.

Проверить, что AAB подписан ожидаемым ключом:

```powershell
keytool -printcert -jarfile dist\android\NovaDarkMessenger-<версия>.aab
keytool -list -v -keystore play-upload-key.jks -alias messandanger
```

SHA-256 fingerprints должны совпадать. Если Google Play уже принимал AAB
со старым ключом, а fingerprint изменился, нужен **upload key reset** в
Play Console; иначе Play отклонит загрузку.

## После сборки

1. **Play Console**: загрузить AAB (Production или Internal testing).
2. **Проверить подпись**: `keytool -printcert -jarfile dist\android\NovaDarkMessenger-<версия>.aab`.
3. **Быстрый smoke-тест на устройстве**:
   ```powershell
   adb install -r dist\android\NovaDarkMessenger-<версия>.apk
   ```
   Проверить: онбординг, `nova://`-ссылка, камера/микрофон в звонке,
   новые тумблеры Settings → Privacy (presence, «Hide my IP in calls»).
4. **RELEASE_NOTES.md** — скрипт `release-notes.ps1` обновляет его сам
   на шаге 2 локальной сборки; при CI-сборке заполните вручную.
5. Следующую загрузку в Play делайте с **увеличенной версией**
   (`1.0.50` → `1.0.51` …), иначе Play отклонит AAB как дубль `versionCode`.

## Что попало в этот релиз (справка)

- Гибридный пост-квантовый handshake (ML-KEM-768) с запретом отката версии.
- Argon2id для новых `.nova-backup` (legacy PBKDF2 читается).
- Relay-only ICE («Hide my IP in calls») + честные бейджи в звонке.
- Presence privacy: opt-in, хеширование, TTL.
- Честный лендинг (без ML-KEM-заявлений, score 8.5, «50 км» и т.п.).
