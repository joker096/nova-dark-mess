#!/usr/bin/env pwsh
# Continuous audit loop - runs all checks repeatedly
# Press Ctrl+C to stop

param(
    [int]$IntervalSeconds = 30,
    [switch]$Once
)

$checks = @(
    @{ Name = "TypeScript lint";       Cmd = "npm run lint" },
    @{ Name = "Unit tests";            Cmd = "npm test" },
    @{ Name = "Security self-test";    Cmd = "npm run test:security" },
    @{ Name = "i18n audit";            Cmd = "npm run audit:i18n" },
    @{ Name = "Button accessibility";  Cmd = "npm run audit:buttons" }
)

function Run-Checks {
    $allPassed = $true
    foreach ($check in $checks) {
        Write-Host "`n=== $($check.Name) ===" -ForegroundColor Cyan
        $result = Invoke-Expression $check.Cmd
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            Write-Host "FAILED: $($check.Name) (exit code $exitCode)" -ForegroundColor Red
            $allPassed = $false
        } else {
            Write-Host "PASSED: $($check.Name)" -ForegroundColor Green
        }
    }
    return $allPassed
}

Write-Host "Starting audit loop (interval: $IntervalSeconds seconds)" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow

do {
    $start = Get-Date
    $passed = Run-Checks
    $elapsed = (Get-Date) - $start
    
    if ($passed) {
        Write-Host "`n✓ All checks passed (${elapsed.TotalSeconds:N1}s)" -ForegroundColor Green
    } else {
        Write-Host "`n✗ Some checks failed (${elapsed.TotalSeconds:N1}s)" -ForegroundColor Red
    }
    
    if (-not $Once) {
        Write-Host "`nWaiting $IntervalSeconds seconds before next run..." -ForegroundColor Yellow
        Start-Sleep -Seconds $IntervalSeconds
    }
} while (-not $Once)