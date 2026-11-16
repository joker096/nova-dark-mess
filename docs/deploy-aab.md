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
$VERSION = "1.0.50"          # ← поменяйте на нужную
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

Требуется: JDK 17, Android SDK (`ANDROID_HOME`), keystore, пароли в `.env`.
Всё это в проекте уже настроено (проверено 2026-11-16).

```powershell
# 1. Подгрузить пароли из .env в переменные окружения процесса
Get-Content .env | Where-Object { $_ -match '^(KEYSTORE_PASSWORD|KEY_PASSWORD)=' } | ForEach-Object {
  $p = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($p[0].Trim(), $p[1].Trim().Trim('"'), 'Process')
}

# 2. Собрать (lint + тесты + подпись включены)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-android.ps1 -Version 1.0.50 -Channel release
```

Результат: `dist\android\NovaDarkMessenger-1.0.50.aab` (+ APK).
Быстрая сборка без проверок: добавить `-SkipTests -SkipLint`.

---

## Перед сборкой: быстрые проверки

```powershell
npm run lint         # tsc — должен быть чист
npm run test         # на 2026-11-16: 743 теста / 95 файлов, зелёные
npm run build        # vite-сборка фронтенда
npm run audit:i18n   # паритет 20 локалей — PASSED
```

Полный чеклист релиза: `docs/release-checklist.md`.

## Требования CI (один раз проверить)

Settings → Secrets and variables → Actions должны быть заполнены:
`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`. Ранее сборки через CI проходили — секреты на месте.

## После сборки

1. **Play Console**: загрузить AAB (Production или Internal testing).
2. **Быстрый smoke-тест на устройстве**:
   ```powershell
   adb install -r dist\android\NovaDarkMessenger-<версия>.apk
   ```
   Проверить: онбординг, `nova://`-ссылка, камера/микрофон в звонке,
   новые тумблеры Settings → Privacy (presence, «Hide my IP in calls»).
3. **RELEASE_NOTES.md** — скрипт `release-notes.ps1` обновляет его сам
   на шаге 2 локальной сборки; при CI-сборке заполните вручную.
4. Следующую загрузку в Play делайте с **увеличенной версией**
   (`1.0.50` → `1.0.51` …), иначе Play отклонит AAB как дубль `versionCode`.

## Что попало в этот релиз (справка)

- Гибридный пост-квантовый handshake (ML-KEM-768) с запретом отката версии.
- Argon2id для новых `.nova-backup` (legacy PBKDF2 читается).
- Relay-only ICE («Hide my IP in calls») + честные бейджи в звонке.
- Presence privacy: opt-in, хеширование, TTL.
- Честный лендинг (без ML-KEM-заявлений, score 8.5, «50 км» и т.п.).
