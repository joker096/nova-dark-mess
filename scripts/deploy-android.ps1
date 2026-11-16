#!/usr/bin/env pwsh
# =============================================================================
# deploy-android.ps1 — Сборка Android AAB / APK для Nova Dark Messenger
# Использование: .\scripts\deploy-android.ps1 -Version 1.0.1 -Channel release
# =============================================================================
param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [Parameter(Mandatory = $true)]
  [ValidateSet('release','debug')]
  [string]$Channel = 'release',

  [string]$KeystorePath = "$PSScriptRoot\..\messandanger-keystore.jks",
  # ВАЖНО: пароли берутся ТОЛЬКО из переменных окружения (или GitHub Secrets в CI).
  # Локально: задайте их в .env (см. .env.example) и подгрузите через $env:KEYSTORE_PASSWORD / $env:KEY_PASSWORD.
  # В CI: задаются в Settings → Secrets и передаются через $env:KEYSTORE_PASSWORD / $env:KEY_PASSWORD (см. android.yml).
  [string]$KeystorePassword = $env:KEYSTORE_PASSWORD,
  [string]$KeyAlias = 'messandanger',
  [string]$KeyPassword = $env:KEY_PASSWORD,

  [switch]$SkipTests,
  [switch]$SkipLint
)

$ErrorActionPreference = 'Stop'
$ROOT = Resolve-Path (Join-Path $PSScriptRoot '..')
$TAURI_CONF = Join-Path $ROOT 'src-tauri\tauri.conf.json'
$CARGO_TOML = Join-Path $ROOT 'src-tauri\Cargo.toml'
$RELEASE_NOTES = Join-Path $ROOT 'RELEASE_NOTES.md'
$ARTIFACTS = Join-Path $ROOT 'dist\android'

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Nova Dark Messenger — Android Deploy ($Channel)              ║" -ForegroundColor Cyan
Write-Host "║  Версия: $Version                                              ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# ── 1. Проверка окружения ─────────────────────────────────────────
Write-Host "`n[1/7] Проверка окружения..." -ForegroundColor Yellow

$javaOk = $false
$javaVer = ''
try {
  # java -version prints to stderr; cmd /c captures it without PS NativeCommandError noise.
  $javaVer = cmd /c 'java -version 2>&1' | Out-String
  if ($LASTEXITCODE -eq 0 -and $javaVer -match 'version "(1\.8|17|19|21|22|23)[.\"]') { $javaOk = $true }
} catch {}
if (-not $javaOk) {
  Write-Error "Java JDK не найден. Установите JDK 17 или 21 и добавьте в PATH."
  exit 1
}
Write-Host "   Java OK: $javaVer" -ForegroundColor Green

if (-not $env:ANDROID_HOME) {
  Write-Error "Переменная ANDROID_HOME не задана. Установите Android SDK и задайте ANDROID_HOME."
  exit 1
}
Write-Host "   ANDROID_HOME: $env:ANDROID_HOME" -ForegroundColor Green

$cmdlineTools = Join-Path $env:ANDROID_HOME 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $cmdlineTools)) {
  Write-Warning "sdkmanager не найден. Установите Android SDK Command-line Tools."
}

# ── 2. Ченджлог ────────────────────────────────────────────────────
Write-Host "`n[2/7] Запись ченджлога..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot 'release-notes.ps1') -Version $Version -Channel $Channel -App 'Android'

# ── 3. Обновление версий ───────────────────────────────────────────
Write-Host "`n[3/7] Обновление версий (tauri.conf.json, Cargo.toml)..." -ForegroundColor Yellow
$conf = Get-Content $TAURI_CONF -Raw | ConvertFrom-Json
$conf.version = $Version
$conf | ConvertTo-Json -Depth 10 | Set-Content $TAURI_CONF

$cargo = Get-Content $CARGO_TOML -Raw
$cargo -replace '^version = ".*"$', "version = `"$Version`"" | Set-Content $CARGO_TOML
Write-Host "   Версия установлена: $Version" -ForegroundColor Green

# ── 4. Проверка кода ───────────────────────────────────────────────
if (-not $SkipLint) {
  Write-Host "`n[4/7] Lint (tsc)..." -ForegroundColor Yellow
  & npm --cwd $ROOT run lint
  if ($LASTEXITCODE -ne 0) { Write-Error "Lint не прошёл."; exit 1 }
  Write-Host "   Lint OK" -ForegroundColor Green
} else {
  Write-Host "`n[4/7] Lint пропущен." -ForegroundColor Gray
}

if (-not $SkipTests) {
  Write-Host "`n[5/7] Тесты (vitest)..." -ForegroundColor Yellow
  & npm --cwd $ROOT test
  if ($LASTEXITCODE -ne 0) { Write-Error "Тесты не прошли."; exit 1 }
  Write-Host "   Тесты OK" -ForegroundColor Green
} else {
  Write-Host "`n[5/7] Тесты пропущены." -ForegroundColor Gray
}

# ── 6. Сборка фронтенда + Tauri ────────────────────────────────────
Write-Host "`n[6/7] Сборка фронтенда и Tauri Android..." -ForegroundColor Yellow
  & npm --cwd $ROOT run build
if ($LASTEXITCODE -ne 0) { Write-Error "Сборка фронтенда не удалась."; exit 1 }

$tauriArgs = @()
if ($Channel -eq 'debug') { $tauriArgs += @('--debug') }

Push-Location $ROOT
try {
  $tauriBin = Join-Path $ROOT 'node_modules\.bin\tauri.cmd'
  & $tauriBin android build @tauriArgs
  if ($LASTEXITCODE -ne 0) { Write-Error "Tauri Android сборка не удалась."; exit 1 }
  Write-Host "   Tauri сборка завершена." -ForegroundColor Green
} finally {
  Pop-Location
}

# ── 7. Подпись и артефакты ─────────────────────────────────────────
Write-Host "`n[7/7] Подготовка артефактов..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $ARTIFACTS | Out-Null

$srcAab = Join-Path $ROOT 'src-tauri\gen\android\app\build\outputs\bundle\release\app-release.aab'
$srcApk = Join-Path $ROOT 'src-tauri\gen\android\app\build\outputs\apk\release\app-release.apk'

if ($Channel -eq 'release') {
  if (-not $KeystorePath -or -not $KeystorePassword -or -not $KeyPassword) {
    Write-Error "Release-сборка требует подписи. Убедитесь, что заданы KeystorePath, KeystorePassword и KeyPassword (env: KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_PASSWORD). Неподписанный AAB не будет создан."
    exit 1
  }
  if (-not $KeystorePath) {
    Write-Warning "Keystore не указан — AAB не будет подписан. Найдите unsigned AAB в gen\android."
    Copy-Item $srcAab -Destination (Join-Path $ARTIFACTS "NovaDarkMessenger-$Version-unsigned.aab") -Force
  } else {
    $jarsignerArgs = @('-verbose', '-sigalg', 'SHA256withRSA', '-digestalg', 'SHA-256', '-keystore', $KeystorePath, '-storepass', $KeystorePassword, '-keypass', $KeyPassword, $srcAab, $KeyAlias)
    & jarsigner @jarsignerArgs
    if ($LASTEXITCODE -ne 0) { Write-Error "Подпись AAB не удалась."; exit 1 }
    Copy-Item $srcAab -Destination (Join-Path $ARTIFACTS "NovaDarkMessenger-$Version.aab") -Force
    Write-Host "   AAB подписан: $ARTIFACTS\NovaDarkMessenger-$Version.aab" -ForegroundColor Green
  }

  $dstApk = Join-Path $ARTIFACTS "NovaDarkMessenger-$Version.apk"
  if (Test-Path $srcApk) { Copy-Item $srcApk -Destination $dstApk -Force }
  Write-Host "   APK: $dstApk" -ForegroundColor Green
} else {
  $dstApk = Join-Path $ARTIFACTS "NovaDarkMessenger-$Version-debug.apk"
  if (Test-Path $srcApk) { Copy-Item $srcApk -Destination $dstApk -Force }
  Write-Host "   Debug APK: $dstApk" -ForegroundColor Green
}

Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Android сборка ГОТОВА ($Channel, v$Version)                    ║" -ForegroundColor Cyan
Write-Host "║  Артефакты: $ARTIFACTS                                          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
