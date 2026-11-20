# Tauri в этом проекте: шпаргалка для ИИ-агентов

Файл для тех, кто впервые открывает репозиторий и собирается трогать нативную
часть. Здесь описан реальный стек, правильный доступ к Android JVM и грабли,
на которые уже наступали. Читать перед любой правкой `src-tauri/`.

## 1. Из чего состоит приложение

Nova Dark Messenger — это **Tauri 2** (~2.12) + React/Vite, а не Capacitor и не
React Native.

| Путь | Что это | Можно ли править руками |
| --- | --- | --- |
| `src/` | React/TypeScript-фронтенд (Vite) | да |
| `src-tauri/src/` | Rust-ядро: команды, keychain, сеть | да |
| `src-tauri/tauri.conf.json` | окна, identifier, deep links, сборка | да |
| `src-tauri/capabilities/` | разрешения Tauri 2 | да |
| `src-tauri/gen/android/` | сгенерированный Gradle-проект | только осознанно, см. ниже |
| `src-tauri/gen/apple/` | сгенерированный Xcode-проект | только осознанно |
| `dist/` | результат `npm run build`, его грузит WebView | не коммитить правки |

Идентификатор приложения: `com.messanger.e2e`, окно по умолчанию называется
`main` (лейбл не задан в `tauri.conf.json`, поэтому Tauri использует `main`).
`gen/android` **закоммичен вместе со собранными assets** — не редактируй
`gen/android/app/src/main/assets/**` вручную, они перезаписываются сборкой.

Полезные команды:

```bash
npm run dev                 # только фронтенд в браузере
npm run tauri:dev:android   # tauri android dev
npm run tauri:build:android # сборка APK/AAB
npm run android:aab         # сборка + копирование бандла
npm run lint                # tsc --noEmit
cd src-tauri && cargo check # Rust под хост
```

## 2. Как Tauri запускает Android (главное)

На Android Tauri сам владеет `android_main` и `AndroidApp`. Публичного API
«дай мне Activity» в крейте `tauri` версии 2.12 **нет**:

- `tauri::android::activity()` — не существует;
- `android_activity::activity()` / `android_activity::android_app()` — не
  публичные, а `AndroidApp` передаётся только внутрь `android_main`, который
  Tauri забирает себе;
- `ndk_context` и глобальные костыли не нужны;
- `AppHandle::run_on_main_thread()` даёт main thread, но **не** даёт JNIEnv;
- добавлять `android-activity` отдельной зависимостью не нужно (она и так
  транзитивная у Tauri, а фича `native-activity` тут не требуется).

Официально поддерживаемый путь — взять JNI-хэндл у WebView:

```rust
// src-tauri/src/lib.rs, внутри .setup(|app| { ... })
#[cfg(target_os = "android")]
{
    use tauri::Manager; // нужен для get_webview_window

    match app.get_webview_window("main") {
        Some(window) => {
            if let Err(err) = window.with_webview(|webview| {
                webview.jni_handle().exec(|env, context, _webview| {
                    // env      — &mut JNIEnv, можно делать JNI-вызовы
                    // context  — android.content.Context (JObject), например
                    //            для getFilesDir()/SharedPreferences
                    match env.get_java_vm() {
                        Ok(vm) => crate::keychain::init_android(vm),
                        Err(err) => log::warn!("android: JavaVM unavailable: {err}"),
                    }
                });
            }) {
                log::warn!("android: with_webview failed: {err}");
            }
        }
        None => log::warn!("android: main window not found"),
    }
}
```

Ключевые свойства этого способа:

- `with_webview` вызывается из `setup`, когда окно из конфига уже создано;
- замыкание `exec` выполняется на нужном потоке, `JNIEnv` живёт только внутри
  него — **не сохраняй `JNIEnv` в статику**, сохраняй `JavaVM`;
- `JavaVM` можно хранить в `OnceLock` и потом делать
  `vm.attach_current_thread()` из любой Rust-команды (так сделано в
  `src-tauri/src/keychain.rs`);
- `context` — это `JObject`, локальная ссылка. Если нужен между вызовами,
  делай `env.new_global_ref(context)` и храни `GlobalRef`;
- `jni` версии 0.21 в `[target.'cfg(target_os = "android")'.dependencies]`
  должен совпадать с версией, которую использует wry/Tauri, иначе типы
  `JavaVM`/`JNIEnv` не сойдутся. Сейчас версия одна — 0.21.1.

### Как это проверять без телефона

Установлены Android-target'ы и NDK; Rust-часть под Android компилируется без
устройства:

```bash
cd src-tauri
cargo check --target aarch64-linux-android
```

Это ловит ошибки типов JNI/cfg, но **не** проверяет runtime. Для runtime нужен
`adb devices` (эмулятор или телефон) и `npm run tauri:dev:android`. Не пиши в
отчёте «работает на Android», если был только `cargo check`.

## 3. Как устроен keychain на Android

`src-tauri/src/keychain.rs`:

- на Windows/macOS/Linux — крейт `keyring`;
- на iOS — `security-framework` (iOS Keychain);
- на Android — JNI + `AndroidKeyStore`. В `setup` через
  `jni_handle().exec(...)` сохраняются **два** глобальных хэндла: `JavaVM` и
  `GlobalRef` на app `Context` (нужен для `getFilesDir()`).

`keychain_available()` на Android возвращает `true` только после захвата обоих.
Если хэндлы не получены, фронтенд (`src/lib/storage/keychain.ts`) уходит в
localStorage-fallback, а не делает вид, что секрет лежит в Keystore.

Схема хранения (реализована в `keychain.rs`, Kotlin-мост не нужен):

1. На каждый account генерируется AES-256 ключ в AndroidKeyStore
   (`KeyGenerator.getInstance("AES", "AndroidKeyStore")` +
   `KeyGenParameterSpec`: `PURPOSE_ENCRYPT | PURPOSE_DECRYPT`, GCM, no padding).
   Ключ неизвлекаемый, alias = account.
2. Значение шифруется `Cipher.getInstance("AES/GCM/NoPadding")` со случайным IV
   на каждый `init`.
3. На диск пишется только шифртекст:
   `<filesDir>/keystore/<hex(account)>.bin`, формат
   `MAGIC "NVKS" | u32 BE iv_len | iv | ciphertext`. Запись идёт через
   временный файл + `rename`, чтобы обрыв не оставил обрезанный блоб.
4. `get` читает файл, достаёт ключ по alias и расшифровывает; `NotFound` — это
   «секрета нет», а любая другая ошибка IO возвращается как ошибка (иначе
   приложение решит, что секрета нет, и осиротит данные).
5. `remove` удаляет блоб и alias из Keystore.

Историческая ловушка: раньше строка сохранялась как `SecretKeySpec` через
`KeyStore.setEntry`. Keystore хранит неизвлекаемые ключи, а не произвольные
блобы, поэтому этот вариант падал. Не возвращай его.

**Статус проверки:** код компилируется под `aarch64-linux-android`, но
runtime-проверки на устройстве/эмуляторе не было (`adb devices` пуст). Не
пиши «keystore работает на Android», пока не выполнен set/get round-trip
после перезапуска приложения.

## 4. Биометрия и WebAuthn — почему переключатель не работал

`src/lib/security/biometric.ts` использует Web Authentication API
(`navigator.credentials.create/get`). Это нормально для браузера и десктопа,
но **в Android WebView у Tauri origin `tauri.localhost`** не является валидным
RP ID, поэтому platform authenticator там недоступен: `create()` падает, и
включить «отпечаток» невозможно. Это не баг вёрстки и не проблема JNI.

Правильный путь для мобильного приложения — официальный
`tauri-plugin-biometric` (нативный `BiometricPrompt` на Android и
`LAContext` на iOS), с сохранением WebAuthn-ветки для браузера:

```ts
const isNative = '__TAURI_INTERNALS__' in window;
// native: checkStatus()/authenticate() из @tauri-apps/plugin-biometric
// web:    текущий WebAuthn-код
```

Плагину нужны: cargo-зависимость + `npm install` + `.plugin(...)` в
`lib.rs` + разрешения в `src-tauri/capabilities/`. Без устройства/эмулятора
это можно только скомпилировать, но не подтвердить работу.

## 5. Tauri-команды и разрешения

- Новую Rust-команду (`#[tauri::command]`) нужно добавить в
  `invoke_handler![...]` в `src-tauri/src/lib.rs`, иначе фронтенд получит
  «command not found».
- В Tauri 2 доступ к командам/плагинам регулируется файлами в
  `src-tauri/capabilities/`. Если плагин добавлен, а capability не обновлён,
  вызов из JS будет отклонён.
- Плагины проекта: `tauri-plugin-deep-link`, `tauri-plugin-log` (только в
  debug). Deep links: схемы в `tauri.conf.json` → `plugins.deep-link`.

## 6. Частые ошибки агентов в этом репозитории

1. Искать `AndroidApp`/`activity()` в `tauri` — его нет; используй
   `with_webview` + `jni_handle`.
2. Добавлять `android-activity` в `Cargo.toml` «чтобы получить Activity» —
   не помогает и конфликтует с фичами.
3. Сохранять `JNIEnv` в `static` — нельзя, только `JavaVM`.
4. Проверять Android только через `cargo check` и заявлять, что фича работает.
5. Путать WebAuthn с нативной биометрией в Tauri-приложении.
6. Редактировать `src-tauri/gen/android/app/src/main/assets/**` — это
   артефакты сборки.
7. Забывать `cfg(target_os = "android")`: код должен компилироваться и под
   Windows/Linux/macOS, где JNI-типов нет.
8. Возвращать `true` из `keychain_available()` без реально
   инициализированного стора — фронтенд поверит и потеряет секрет при ошибке.

## 7. Ссылки

- Tauri 2, мобильные плагины: <https://v2.tauri.app/develop/plugins/develop-mobile/>
- Tauri 2, биометрия: <https://v2.tauri.app/plugin/biometric/>
- Обсуждение доступа к Android context в Tauri (решение через
  `jni_handle().exec`): <https://github.com/tauri-apps/tauri/issues/13267>
- Android Keystore: <https://developer.android.com/privacy-and-security/keystore>
