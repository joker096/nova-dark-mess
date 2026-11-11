#!/usr/bin/env pwsh
# =============================================================================
# release-notes.ps1 — Запись изменений при деплое (ченджлог)
# Использование: .\scripts\release-notes.ps1 -Version 1.0.1 -Channel release -App Android
# =============================================================================
param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [Parameter(Mandatory = $true)]
  [ValidateSet('release','debug','ios','macos')]
  [string]$Channel,

  [Parameter(Mandatory = $true)]
  [ValidateSet('Android','iOS','macOS')]
  [string]$App,

  [string]$Notes
)

$ErrorActionPreference = 'Stop'
$ROOT = Resolve-Path (Join-Path $PSScriptRoot '..')
$RELEASE_NOTES = Join-Path $ROOT 'RELEASE_NOTES.md'
$NOW = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$PLATFORM_LABEL = @{ 'Android' = 'Android (AAB/APK)'; 'iOS' = 'iOS (IPA)'; 'macOS' = 'macOS' }[$App]
$channelLabel = @{ 'release' = 'Релиз'; 'debug' = 'Отладочная'; 'ios' = 'Релиз'; 'macos' = 'Релиз' }[$Channel]

$noteText = if ([string]::IsNullOrWhiteSpace($Notes)) { '_Изменения не указаны (автофиксация из Git)._' } else { $Notes }

$entry = "### v$Version — $channelLabel ($PLATFORM_LABEL)`n**Дата:** $NOW`n**Канал:** $Channel | **Платформа:** $App`n`n$noteText`n"

$existing = ''
if (Test-Path $RELEASE_NOTES) {
  $existing = Get-Content $RELEASE_NOTES -Raw
}

$newContent = $entry + "`n`n" + $existing
$newContent | Set-Content $RELEASE_NOTES -Encoding UTF8

Write-Host "Ченджлог записан: $RELEASE_NOTES" -ForegroundColor Green
Write-Host $entry -ForegroundColor Gray
