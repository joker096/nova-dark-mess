#!/usr/bin/env pwsh
# =============================================================================
# deploy-ios.ps1 — Сборка iOS IPA для Nova Dark Messenger
# ВАЖНО: iOS-сборка возможна ТОЛЬКО на macOS (Xcode 15+).
# На Windows скрипт выводит инструкции по запуску на Mac / GitHub Actions.
# =============================================================================
param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [string]$AppleId,
  [string]$TeamId,
  [string]$ProvisioningProfile,
  [string]$SigningCertificate,

  [switch]$SkipTests,
  [switch]$SkipLint
)

$ErrorActionPreference = 'Stop'
$ROOT = Resolve-Path (Join-Path $PSScriptRoot '..')
$TAURI_CONF = Join-Path $ROOT 'src-tauri\tauri.conf.json'
$CARGO_TOML = Join-Path $ROOT 'src-tauri\Cargo.toml'
$RELEASE_NOTES = Join-Path $ROOT 'RELEASE_NOTES.md'
$ARTIFACTS = Join-Path $ROOT 'dist\ios'

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Nova Dark Messenger — iOS Deploy                              ║" -ForegroundColor Cyan
Write-Host "║  Версия: $Version                                              ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# ── 1. Проверка macOS ──────────────────────────────────────────────
if ($IsWindows -or $IsLinux) {
  Write-Host "`n[!] iOS-сборка НЕ поддерживается на $(if ($IsWindows) { 'Windows' } else { 'Linux' })." -ForegroundColor Red
  Write-Host "   Требуется macOS с Xcode 15+ и Apple Developer Program." -ForegroundColor Yellow
  Write-Host "   Варианты:" -ForegroundColor Yellow
  Write-Host "     1. Локальный Mac:  ./scripts/deploy-ios.ps1 -Version $Version" -ForegroundColor Gray
  Write-Host "     2. GitHub Actions: .github/workflows/ios.yml (macOS runner)" -ForegroundColor Gray
  Write-Host "     3. Codemagic / Bitrise / MacStadium CI" -ForegroundColor Gray
}

# ── 2. Ченджлог ────────────────────────────────────────────────────
Write-Host "`n[2/6] Запись ченджлога..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot 'release-notes.ps1') -Version $Version -Channel 'iOS' -App 'iOS'

# ── 3. Обновление версий ───────────────────────────────────────────
Write-Host "`n[3/6] Обновление версий..." -ForegroundColor Yellow
$conf = Get-Content $TAURI_CONF -Raw | ConvertFrom-Json
$conf.version = $Version
$conf | ConvertTo-Json -Depth 10 | Set-Content $TAURI_CONF

$cargo = Get-Content $CARGO_TOML -Raw
$cargo -replace '^version = ".*"$', "version = `"$Version`"" | Set-Content $CARGO_TOML
Write-Host "   Версия установлена: $Version" -ForegroundColor Green

# ── 4. Проверка кода ───────────────────────────────────────────────
if (-not $SkipLint) {
  Write-Host "`n[4/6] Lint (tsc)..." -ForegroundColor Yellow
  & npm run lint --cwd $ROOT
  if ($LASTEXITCODE -ne 0) { Write-Error "Lint не прошёл."; exit 1 }
  Write-Host "   Lint OK" -ForegroundColor Green
} else {
  Write-Host "`n[4/6] Lint пропущен." -ForegroundColor Gray
}

if (-not $SkipTests) {
  Write-Host "`n[5/6] Тесты (vitest)..." -ForegroundColor Yellow
  & npm test --cwd $ROOT
  if ($LASTEXITCODE -ne 0) { Write-Error "Тесты не прошли."; exit 1 }
  Write-Host "   Тесты OK" -ForegroundColor Green
} else {
  Write-Host "`n[5/6] Тесты пропущены." -ForegroundColor Gray
}

# ── 6. Сборка iOS (только macOS) ───────────────────────────────────
Write-Host "`n[6/6] Сборка Tauri iOS..." -ForegroundColor Yellow

if ($IsMacOS) {
  & npx tauri ios build --release --cwd $ROOT
  if ($LASTEXITCODE -ne 0) { Write-Error "Tauri iOS сборка не удалась."; exit 1 }

  New-Item -ItemType Directory -Force -Path $ARTIFACTS | Out-Null
  $srcIpa = Join-Path $ROOT 'src-tauri\gen\ios\app\build\Release-iphoneos\Nova Dark Messenger.ipa'
  if (Test-Path $srcIpa) {
    Copy-Item $srcIpa -Destination (Join-Path $ARTIFACTS "NovaDarkMessenger-$Version.ipa") -Force
    Write-Host "   IPA: $ARTIFACTS\NovaDarkMessenger-$Version.ipa" -ForegroundColor Green
  } else {
    Write-Warning "IPA не найден по ожидаемому пути. Проверьте src-tauri\gen\ios\"
  }
} else {
  Write-Host "   Пропущено (не macOS). Для сборки выполните на Mac:" -ForegroundColor Yellow
  Write-Host "     cd src-tauri && npx tauri ios build --release" -ForegroundColor Gray
}

Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  iOS подготовка завершена (v$Version)                           ║" -ForegroundColor Cyan
Write-Host "║  Артефакты: $ARTIFACTS                                         ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
