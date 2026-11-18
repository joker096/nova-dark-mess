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

  # Keystore selection order: explicit args > keystore.properties >
  # ANDROID_KEYSTORE_PATH/KEYSTORE_PATH > play-upload-key.jks (the only key).
  # Passwords are never logged.
  [string]$KeystorePath = '',
  [string]$KeystorePassword = '',
  [string]$KeyAlias = '',
  [string]$KeyPassword = '',

  [switch]$SkipTests,
  [switch]$SkipLint,

  # Play rejects any AAB signed with another key, so the build refuses to run on
  # a foreign key unless you pass -AllowKeyChange (only after requesting an
  # upload key reset in Play).
  [switch]$AllowKeyChange
)

$ErrorActionPreference = 'Stop'
$ROOT = Resolve-Path (Join-Path $PSScriptRoot '..')
$TAURI_CONF = Join-Path $ROOT 'src-tauri\tauri.conf.json'
$CARGO_TOML = Join-Path $ROOT 'src-tauri\Cargo.toml'
$RELEASE_NOTES = Join-Path $ROOT 'RELEASE_NOTES.md'
$ANDROID_DIR = Join-Path $ROOT 'src-tauri\gen\android'
$KEYSTORE_PROPS = Join-Path $ANDROID_DIR 'keystore.properties'
$DEFAULT_KEYSTORE = Join-Path $ROOT 'play-upload-key.jks'
$ARTIFACTS = Join-Path $ROOT 'dist\android'

# Google Play upload key (alias `messandanger`). This is the ONLY keystore in
# the project: Play ties every future upload to this SHA-1.
$EXPECTED_UPLOAD_SHA1 = '5E:1B:A8:21:E0:80:EE:36:C8:27:FE:CE:9E:83:59:F4:AC:46:90:E4'
$EXPECTED_UPLOAD_SHA256 = '13:36:84:83:A8:79:06:AD:1A:61:97:86:91:03:9A:BA:DE:F0:70:E7:1C:9B:52:8E:E4:73:A2:73:A3:9F:86:3D'
$EXPECTED_UPLOAD_ALIAS = 'messandanger'

$keystoreProps = @{}
if (Test-Path -LiteralPath $KEYSTORE_PROPS) {
  Get-Content -LiteralPath $KEYSTORE_PROPS | ForEach-Object {
    if ($_ -match '^\s*([^#=]+?)\s*=\s*(.*)$') {
      $keystoreProps[$matches[1]] = $matches[2].Trim()
    }
  }
}

$propsStoreFile = $keystoreProps['storeFile']
$propsKeystorePath = $null
if ($propsStoreFile) {
  $propsKeystorePath = if ([IO.Path]::IsPathRooted($propsStoreFile)) {
    $propsStoreFile
  } else {
    # Relative storeFile is resolved the same way Gradle's rootProject.file()
    # does it: against src-tauri/gen/android, NOT the app/ module dir.
    Join-Path $ANDROID_DIR $propsStoreFile
  }
  $propsKeystorePath = [IO.Path]::GetFullPath($propsKeystorePath)
}

if ((Test-Path -LiteralPath $KEYSTORE_PROPS) -and -not $propsStoreFile -and -not $KeystorePath) {
  Write-Error "keystore.properties не содержит storeFile. Восстановите файл: storeFile=../../../play-upload-key.jks, alias messandanger."
  exit 1
}

if ($KeystorePath) {
  $resolvedKeystorePath = $KeystorePath
} elseif ($propsKeystorePath) {
  if (-not (Test-Path -LiteralPath $propsKeystorePath)) {
    Write-Error "keystore.properties указывает на отсутствующий файл: $propsKeystorePath. Восстановите ключ или удалите properties."
    exit 1
  }
  $resolvedKeystorePath = $propsKeystorePath
} elseif ($env:ANDROID_KEYSTORE_PATH) {
  $resolvedKeystorePath = $env:ANDROID_KEYSTORE_PATH
} elseif ($env:KEYSTORE_PATH) {
  $resolvedKeystorePath = $env:KEYSTORE_PATH
} else {
  $resolvedKeystorePath = $DEFAULT_KEYSTORE
}
if (-not [IO.Path]::IsPathRooted($resolvedKeystorePath)) {
  $resolvedKeystorePath = Join-Path $ROOT $resolvedKeystorePath
}
$resolvedKeystorePath = [IO.Path]::GetFullPath($resolvedKeystorePath)

$selectedUsesProps = $propsKeystorePath -and ($resolvedKeystorePath -eq $propsKeystorePath)

$resolvedKeystorePassword = if ($KeystorePassword) {
  $KeystorePassword
} elseif ($selectedUsesProps -and $keystoreProps['storePassword']) {
  $keystoreProps['storePassword']
} elseif ($env:ANDROID_KEYSTORE_PASSWORD) {
  $env:ANDROID_KEYSTORE_PASSWORD
} elseif ($env:KEYSTORE_PASSWORD) {
  $env:KEYSTORE_PASSWORD
} else {
  ''
}

$resolvedKeyAlias = if ($KeyAlias) {
  $KeyAlias
} elseif ($selectedUsesProps -and $keystoreProps['keyAlias']) {
  $keystoreProps['keyAlias']
} elseif ($env:ANDROID_KEY_ALIAS) {
  $env:ANDROID_KEY_ALIAS
} elseif ($env:KEY_ALIAS) {
  $env:KEY_ALIAS
} else {
  'upload'
}

$resolvedKeyPassword = if ($KeyPassword) {
  $KeyPassword
} elseif ($selectedUsesProps -and $keystoreProps['keyPassword']) {
  $keystoreProps['keyPassword']
} elseif ($env:ANDROID_KEY_PASSWORD) {
  $env:ANDROID_KEY_PASSWORD
} elseif ($env:KEY_PASSWORD) {
  $env:KEY_PASSWORD
} else {
  $resolvedKeystorePassword
}

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Nova Dark Messenger — Android Deploy ($Channel)              ║" -ForegroundColor Cyan
Write-Host "║  Версия: $Version                                              ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# Gradle (app/build.gradle.kts) reads keystore.properties with rootProject.file(),
# i.e. relative to src-tauri/gen/android. An absolute storeFile would make Gradle
# open a different key than the one verified above, so warn early.
if ($Channel -eq 'release' -and $propsStoreFile -and [IO.Path]::IsPathRooted($propsStoreFile) -and $propsKeystorePath -ne $resolvedKeystorePath) {
  Write-Warning "keystore.properties uses an absolute storeFile ($propsStoreFile). Gradle будет вынужден взять $resolvedKeystorePath через ANDROID_KEYSTORE_PATH; лучше хранить относительный путь."
}

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

# Cargo must link the Android .so files with the NDK toolchain. Without explicit
# CC/linker/CARGO_TARGET_*_LINKER on a Windows host, cargo falls back to the
# first `cc` on PATH (e.g. MinGW gcc) and the build dies with
# "x86_64-w64-mingw32/bin/ld.exe: unrecognized option '--eh-frame-hdr'".
if (-not $env:ANDROID_NDK_HOME -or -not (Test-Path $env:ANDROID_NDK_HOME)) {
  $env:ANDROID_NDK_HOME = Get-ChildItem -Path (Join-Path $env:ANDROID_HOME 'ndk') -Directory -ErrorAction SilentlyContinue |
    Sort-Object { [version]($_.Name -replace '[^0-9.].*$', '') } -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}
$ndkBin = if ($env:ANDROID_NDK_HOME) { Join-Path $env:ANDROID_NDK_HOME 'toolchains\llvm\prebuilt\windows-x86_64\bin' } else { $null }
if (-not $ndkBin -or -not (Test-Path (Join-Path $ndkBin 'clang.exe'))) {
  Write-Error "Android NDK не найден (ANDROID_HOME\ndk). Установите NDK 26+: sdkmanager --install 'ndk;27.0.12077973'."
  exit 1
}
$ndkTriples = @{
  'aarch64-linux-android'   = 'aarch64-linux-android24-clang'
  'armv7-linux-androideabi' = 'armv7a-linux-androideabi24-clang'
  'i686-linux-android'      = 'i686-linux-android24-clang'
  'x86_64-linux-android'    = 'x86_64-linux-android24-clang'
}
foreach ($target in $ndkTriples.Keys) {
  $wrapper = Join-Path $ndkBin ($ndkTriples[$target] + '.cmd')
  $envVarName = 'CARGO_TARGET_' + ($target.ToUpperInvariant() -replace '[-.]', '_') + '_LINKER'
  Set-Item -Path "env:$envVarName" -Value $wrapper
}
# cc crate also honours CC_<target>; keep the generic CC out of the way so that
# globally installed MinGW clang/gcc cannot hijack the Android link step.
$env:CC_aarch64_linux_android = Join-Path $ndkBin 'aarch64-linux-android24-clang.cmd'
$env:CC_armv7_linux_androideabi = Join-Path $ndkBin 'armv7a-linux-androideabi24-clang.cmd'
$env:CC_i686_linux_android = Join-Path $ndkBin 'i686-linux-android24-clang.cmd'
$env:CC_x86_64_linux_android = Join-Path $ndkBin 'x86_64-linux-android24-clang.cmd'
Write-Host "   NDK: $env:ANDROID_NDK_HOME" -ForegroundColor Green

if ($Channel -eq 'release') {
  Write-Host "   Upload key: $resolvedKeystorePath (alias: $resolvedKeyAlias)" -ForegroundColor Green
  if (-not (Test-Path -LiteralPath $resolvedKeystorePath)) {
    Write-Error "Keystore не найден: $resolvedKeystorePath. Единственный ключ — play-upload-key.jks в корне проекта; восстановите его из резервной копии или задайте ANDROID_KEYSTORE_PATH. Создавать новый ключ нельзя: Play его не примет."
    exit 1
  }
  if (-not $resolvedKeystorePassword) {
    Write-Error "Пароль keystore не задан. Задайте ANDROID_KEYSTORE_PASSWORD или KEYSTORE_PASSWORD."
    exit 1
  }
  # keytool writes its JKS-format warnings to stderr. Capture via a temp file
  # instead of 2>&1: in PowerShell 5.1 a redirected native stderr line becomes an
  # ErrorRecord, and $ErrorActionPreference='Stop' would abort the build.
  $keytoolOut = Join-Path ([IO.Path]::GetTempPath()) "nova-keytool-$PID.txt"
  cmd /c "keytool -list -v -keystore `"$resolvedKeystorePath`" -storepass $resolvedKeystorePassword -alias $resolvedKeyAlias > `"$keytoolOut`" 2>&1" | Out-Null
  $keytoolExit = $LASTEXITCODE
  $keytoolCheck = if (Test-Path -LiteralPath $keytoolOut) { Get-Content -LiteralPath $keytoolOut } else { @() }
  Remove-Item -LiteralPath $keytoolOut -Force -ErrorAction SilentlyContinue
  if ($keytoolExit -ne 0) {
    Write-Error "Не удалось открыть keystore/alias '$resolvedKeyAlias'. Проверьте путь, пароль и alias (alias Play-ключа: '$EXPECTED_UPLOAD_ALIAS')."
    exit 1
  }
  $selectedSha1 = (($keytoolCheck | Select-String -Pattern 'SHA1:' | Select-Object -First 1).Line -replace '^.*SHA1:\s*', '').Trim().ToUpperInvariant()
  Write-Host "   SHA-1 ключа: $selectedSha1" -ForegroundColor Green
  if ($selectedSha1 -ne $EXPECTED_UPLOAD_SHA1) {
    if (-not $AllowKeyChange) {
      Write-Error "Выбран НЕ Play upload-ключ ($resolvedKeystorePath, alias '$resolvedKeyAlias'). Play примет только SHA-1 $EXPECTED_UPLOAD_SHA1 (alias '$EXPECTED_UPLOAD_ALIAS'), а у этого ключа $selectedSha1. Укажите -KeystorePath play-upload-key.jks -KeyAlias messandanger (пароль: BUBBLEWRAP_KEYSTORE_PASSWORD) или, если ключ действительно меняется, запросите upload key reset в Play Console и повторите с -AllowKeyChange."
      exit 1
    }
    Write-Warning "Ключ не совпадает с Play upload-ключом ($selectedSha1). Сборка продолжена из-за -AllowKeyChange; Play отклонит AAB, пока ключ не сброшен."
  }
  # Export the canonical names consumed by app/build.gradle.kts, so Gradle
  # signs the release bundle with the same key this script verifies.
  $env:ANDROID_KEYSTORE_PATH = $resolvedKeystorePath
  $env:ANDROID_KEYSTORE_PASSWORD = $resolvedKeystorePassword
  $env:ANDROID_KEY_ALIAS = $resolvedKeyAlias
  $env:ANDROID_KEY_PASSWORD = $resolvedKeyPassword
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
  & npm --prefix $ROOT run lint
  if ($LASTEXITCODE -ne 0) { Write-Error "Lint не прошёл."; exit 1 }
  Write-Host "   Lint OK" -ForegroundColor Green
} else {
  Write-Host "`n[4/7] Lint пропущен." -ForegroundColor Gray
}

if (-not $SkipTests) {
  Write-Host "`n[5/7] Тесты (vitest)..." -ForegroundColor Yellow
  & npm --prefix $ROOT test -- --run
  if ($LASTEXITCODE -ne 0) { Write-Error "Тесты не прошли."; exit 1 }
  Write-Host "   Тесты OK" -ForegroundColor Green
} else {
  Write-Host "`n[5/7] Тесты пропущены." -ForegroundColor Gray
}

# ── 6. Сборка фронтенда + Tauri ────────────────────────────────────
Write-Host "`n[6/7] Сборка фронтенда и Tauri Android..." -ForegroundColor Yellow

# npm/npx on Windows are .ps1 shims: with $ErrorActionPreference='Stop' the vite
# "chunks are larger than 500 kB" warning is written to stderr, wrapped into a
# NativeCommandError and kills the script even though the build succeeded. Run
# them with 'Continue' and judge success by $LASTEXITCODE only.
$ps1Shims = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  & npm --prefix $ROOT run build
  $buildExit = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $ps1Shims
}
if ($buildExit -ne 0) { Write-Error "Сборка фронтенда не удалась."; exit 1 }

$tauriArgs = @()
if ($Channel -eq 'debug') { $tauriArgs += @('--debug') }

Push-Location $ROOT
$ErrorActionPreference = 'Continue'
try {
  $tauriBin = Join-Path $ROOT 'node_modules\.bin\tauri.cmd'
  & $tauriBin android build @tauriArgs
  $tauriExit = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $ps1Shims
  Pop-Location
}
if ($tauriExit -ne 0) { Write-Error "Tauri Android сборка не удалась."; exit 1 }
Write-Host "   Tauri сборка завершена." -ForegroundColor Green

# ── 7. Подпись и артефакты ─────────────────────────────────────────
Write-Host "`n[7/7] Подготовка артефактов..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $ARTIFACTS | Out-Null

# Tauri/Gradle may emit AABs under bundle/universalRelease (not bundle/release),
# so discover the newest artifact instead of assuming one hard-coded path.
$bundleRoot = Join-Path $ROOT 'src-tauri\gen\android\app\build\outputs\bundle'
$apkRoot = Join-Path $ROOT 'src-tauri\gen\android\app\build\outputs\apk'

$srcAab = Get-ChildItem -LiteralPath $bundleRoot -Recurse -Filter '*.aab' -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match 'release' } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$apkFolder = if ($Channel -eq 'release') { '\\release\\' } else { '\\debug\\' }
$srcApk = Get-ChildItem -LiteralPath $apkRoot -Recurse -Filter '*.apk' -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match $apkFolder -and $_.Name -notmatch 'unsigned' } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

function Get-CertificateSha256([object[]]$lines) {
  $line = $lines | Select-String -Pattern 'SHA256:' | Select-Object -First 1
  if (-not $line) { return $null }
  return (($line.Line -replace '^.*SHA256:\s*', '').Trim()).ToUpperInvariant()
}

function Assert-AabElf16kAlignment([string]$bundlePath, [string]$objdumpPath) {
  if (-not (Test-Path -LiteralPath $objdumpPath)) {
    throw "llvm-objdump не найден: $objdumpPath"
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($bundlePath)
  $tempDir = Join-Path ([IO.Path]::GetTempPath()) "nova-aab-16k-$PID-$([guid]::NewGuid().ToString('N'))"
  New-Item -ItemType Directory -Path $tempDir | Out-Null

  try {
    $nativeEntries = @($archive.Entries | Where-Object { $_.FullName -match '\.so$' })
    if ($nativeEntries.Count -eq 0) {
      throw "AAB не содержит нативных библиотек для проверки 16-КБ выравнивания."
    }

    $index = 0
    foreach ($entry in $nativeEntries) {
      $libraryPath = Join-Path $tempDir "native-$index.so"
      $input = $entry.Open()
      try {
        $outputFile = [IO.File]::Create($libraryPath)
        try { $input.CopyTo($outputFile) } finally { $outputFile.Dispose() }
      } finally {
        $input.Dispose()
      }

      $headers = & $objdumpPath -p $libraryPath 2>&1
      if ($LASTEXITCODE -ne 0) {
        throw "Не удалось прочитать ELF-заголовки $($entry.FullName)."
      }
      $loadSegments = @($headers | Select-String -Pattern '^\s*LOAD\s+')
      if ($loadSegments.Count -eq 0) {
        throw "В $($entry.FullName) не найдены LOAD-сегменты."
      }
      foreach ($segment in $loadSegments) {
        if ($segment.Line -notmatch 'align\s+2\*\*(\d+)') {
          throw "Не удалось определить выравнивание LOAD-сегмента: $($entry.FullName)."
        }
        if ([int]$matches[1] -lt 14) {
          throw "Библиотека $($entry.FullName) не выровнена на 16 КБ: $($segment.Line.Trim())"
        }
      }

      Write-Host "   16-КБ ELF alignment OK: $($entry.FullName)" -ForegroundColor Green
      $index += 1
    }
  } finally {
    $archive.Dispose()
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if ($Channel -eq 'release') {
  if (-not $srcAab) {
    Write-Error "AAB не найден в $bundleRoot. Tauri/Gradle не создал release bundle."
    exit 1
  }

  Assert-AabElf16kAlignment $srcAab.FullName (Join-Path $ndkBin 'llvm-objdump.exe')

  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  $keyOut = (& keytool -list -v -keystore $resolvedKeystorePath -storepass $resolvedKeystorePassword -alias $resolvedKeyAlias) 2>&1
  $keytoolExit = $LASTEXITCODE
  $ErrorActionPreference = $prevEap
  if ($keytoolExit -ne 0) {
    Write-Error "Не удалось прочитать сертификат upload-ключа."
    exit 1
  }
  $keyFingerprint = Get-CertificateSha256 $keyOut

  $ErrorActionPreference = 'SilentlyContinue'
  $certOut = (& keytool -printcert -jarfile $srcAab.FullName) 2>&1
  $printCertExit = $LASTEXITCODE
  $ErrorActionPreference = $prevEap
  $artifactFingerprint = if ($printCertExit -eq 0) { Get-CertificateSha256 $certOut } else { $null }

  if (-not $artifactFingerprint) {
    Write-Warning "Gradle оставил AAB неподписанным. Подписываю upload-ключом."
    $jarsignerArgs = @(
      '-sigalg', 'SHA256withRSA',
      '-digestalg', 'SHA-256',
      '-keystore', $resolvedKeystorePath,
      '-storepass', $resolvedKeystorePassword,
      '-keypass', $resolvedKeyPassword,
      $srcAab.FullName,
      $resolvedKeyAlias
    )
    & jarsigner @jarsignerArgs
    if ($LASTEXITCODE -ne 0) {
      Write-Error "Подпись AAB не удалась."
      exit 1
    }
    $ErrorActionPreference = 'SilentlyContinue'
    $certOut = (& keytool -printcert -jarfile $srcAab.FullName) 2>&1
    $ErrorActionPreference = $prevEap
    $artifactFingerprint = Get-CertificateSha256 $certOut
  }

  if ($artifactFingerprint -ne $keyFingerprint) {
    Write-Error "AAB подписан не тем ключом. artifact=$artifactFingerprint expected=$keyFingerprint. Проверьте ANDROID_KEYSTORE_* / keystore.properties; не переподписывайте Play-релиз чужим ключом."
    exit 1
  }

  if (-not $AllowKeyChange -and $artifactFingerprint -ne $EXPECTED_UPLOAD_SHA256) {
    Write-Error "AAB подписан не Play upload-ключом (artifact=$artifactFingerprint, ожидался $EXPECTED_UPLOAD_SHA256). Play ответит 'Набор App Bundle подписан с помощью неправильного ключа'. Артефакт не скопирован в $ARTIFACTS."
    exit 1
  }

  $ErrorActionPreference = 'SilentlyContinue'
  & jarsigner -verify $srcAab.FullName 2>&1 | Out-Null
  $verifyExit = $LASTEXITCODE
  $ErrorActionPreference = $prevEap
  if ($verifyExit -ne 0) {
    Write-Error "jarsigner не подтвердил подпись AAB."
    exit 1
  }

  $dstAab = Join-Path $ARTIFACTS "NovaDarkMessenger-$Version.aab"
  Copy-Item -LiteralPath $srcAab.FullName -Destination $dstAab -Force
  Write-Host "   AAB подписан ($artifactFingerprint): $dstAab" -ForegroundColor Green

  $dstApk = Join-Path $ARTIFACTS "NovaDarkMessenger-$Version.apk"
  if ($srcApk) {
    Copy-Item -LiteralPath $srcApk.FullName -Destination $dstApk -Force
    Write-Host "   APK: $dstApk" -ForegroundColor Green
  } else {
    Write-Warning "Release APK не найден; AAB готов."
  }
} else {
  $dstApk = Join-Path $ARTIFACTS "NovaDarkMessenger-$Version-debug.apk"
  if ($srcApk) {
    Copy-Item -LiteralPath $srcApk.FullName -Destination $dstApk -Force
    Write-Host "   Debug APK: $dstApk" -ForegroundColor Green
  } else {
    Write-Error "Debug APK не найден в $apkRoot."
    exit 1
  }
}

# ── 8. Актуальная версия в корне репозитория ──────────────────────
# CI (android.yml) вызывает этот скрипт напрямую (не через npm run
# tauri:build:android), поэтому posttauri-хук copy-android-bundle не срабатывает.
# Копируем свежий AAB в корень как mess-<version>-<code>.aab + mess-latest.aab,
# чтобы в корне всегда была актуальная релизная версия.
if ($Channel -eq 'release') {
  Write-Host "`n[+] Копирование актуальной версии в корень..." -ForegroundColor Yellow
  $step8Eap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    node (Join-Path $PSScriptRoot 'copy-android-bundle.mjs')
    $copyExit = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $step8Eap
  }
  if ($copyExit -ne 0) {
    Write-Error "Не удалось скопировать AAB в корень (copy-android-bundle.mjs)."
    exit 1
  }
  Write-Host "   Актуальная версия в корне: mess-latest.aab + mess-$Version.aab" -ForegroundColor Green
}

Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Android сборка ГОТОВА ($Channel, v$Version)                    ║" -ForegroundColor Cyan
Write-Host "║  Артефакты: $ARTIFACTS                                          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
