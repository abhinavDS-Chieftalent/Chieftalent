# Snapshot the UI source, backend routes/services and the built SPA outside the project.
# Usage: powershell -File scripts/ui_checkpoint.ps1 <name>
param([Parameter(Mandatory = $true)][string]$Name)

$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $env:TEMP "chieftalent-ckpt\$Name"
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Path $dest -Force | Out-Null

$items = @(
  @{ From = "frontend\src";        To = "frontend\src" },
  @{ From = "frontend\public";     To = "frontend\public" },
  @{ From = "app\services";        To = "app\services" },
  @{ From = "app\routes";          To = "app\routes" },
  @{ From = "app\static\spa";      To = "app\static\spa" }
)
foreach ($i in $items) {
  $src = Join-Path $root $i.From
  if (Test-Path $src) {
    robocopy $src (Join-Path $dest $i.To) /E /NFL /NDL /NJH /NJS /NP | Out-Null
  }
}
Copy-Item (Join-Path $root "frontend\index.html") (Join-Path $dest "frontend") -Force
Write-Output "checkpoint '$Name' -> $dest"
