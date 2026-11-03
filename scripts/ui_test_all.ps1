# Run every UI and backend check against a fresh scratch copy (fake data, no real DB/SMTP/AI).
# Usage: powershell -File scripts/ui_test_all.ps1 [-NoBuild]
#
# The suites share one scratch database and some of them change it (the interview suite verifies an
# email and advances candidates; the review suite saves a decision), so this script resets the scratch
# environment first and runs the interview suite last. Do not run them in another order against a
# used scratch copy: the dashboard and review counts will no longer match the fixtures.
param([switch]$NoBuild)

$root = Split-Path -Parent $PSScriptRoot
$cycle = Join-Path $root "scripts\ui_cycle.ps1"
if ($NoBuild) { & powershell -NoProfile -File $cycle -NoBuild } else { & powershell -NoProfile -File $cycle }

Push-Location (Join-Path $root "frontend")
$summary = @()
$failed = $false
foreach ($t in "test-tokens", "test-landing", "test-shell", "test-dashboard", "test-review", "test-interview") {
  $o = node "$t.mjs" 2>&1 | Out-String
  $lines = $o -split "`n"
  $pass = ($lines | Where-Object { $_ -match "^PASS" }).Count
  $bad = $lines | Where-Object { $_ -match "^FAIL|CHECK\(S\) FAILED|JS errors" }
  if ($bad.Count) { $failed = $true }
  $summary += ("{0,-16} pass={1,-4} {2}" -f $t, $pass, $(if ($bad.Count) { "FAILED: " + ($bad -join " | ") } else { "ALL CHECKS PASSED" }))
}
$o = node test-no-provider-names.mjs 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { $failed = $true }
$summary += ("{0,-16} {1}" -f "provider-names", $o.Trim())
Pop-Location

# backend checks need a pristine scratch copy of their own
& powershell -NoProfile -File $cycle -NoBuild | Out-Null
$py = Join-Path $root ".venv\Scripts\python.exe"
$s = Join-Path $env:TEMP "chieftalent-scratch"
$o = & $py -I (Join-Path $s "scripts\test_ai_naming.py") 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { $failed = $true }
$summary += ("{0,-16} {1}" -f "ai-naming", (($o -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 1)))
Push-Location $s
$o = & $py -I -c "import sys; sys.path.insert(0, r'$s'); exec(open(r'$s\scripts\smoke_test.py', encoding='utf8').read())" 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { $failed = $true }
$summary += ("{0,-16} {1}" -f "smoke-test", (($o -split "`n" | Where-Object { $_ -match "checks passed" } | Select-Object -Last 1)))
Pop-Location

$summary
if ($failed) { Write-Output "`nSOMETHING FAILED"; exit 1 } else { Write-Output "`nEVERYTHING PASSED" }
