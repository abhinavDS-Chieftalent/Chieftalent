# Rebuild the SPA, refresh the scratch copy (fresh fake data) and restart the scratch server on :5055.
# Usage: powershell -File scripts/ui_cycle.ps1 [-NoBuild]
param([switch]$NoBuild)

$root = Split-Path -Parent $PSScriptRoot
$py = Join-Path $root ".venv\Scripts\python.exe"
$scratch = Join-Path $env:TEMP "chieftalent-scratch"

# stop any previous scratch server
Get-NetTCPConnection -State Listen -LocalPort 5055 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500

if (-not $NoBuild) {
  Push-Location (Join-Path $root "frontend")
  $out = npm run build 2>&1 | Out-String
  Pop-Location
  if ($out -notmatch "built in") { Write-Output $out; throw "frontend build failed" }
  Write-Output ("build: " + (($out -split "`n" | Select-String "built in").ToString().Trim()))
}

& $py -I (Join-Path $root "scripts\ui_scratch.py") --seed-only | Out-Null
# no -I here: run.py must import the scratch copy's `app` package from its own folder
Start-Process -FilePath $py -ArgumentList "run.py" -WorkingDirectory $scratch -WindowStyle Hidden

for ($i = 0; $i -lt 40; $i++) {
  try { if ((Invoke-WebRequest "http://127.0.0.1:5055/api/health" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { Write-Output "scratch server up on :5055"; exit 0 } } catch {}
  Start-Sleep -Milliseconds 500
}
throw "scratch server did not start"
