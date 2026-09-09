# start.ps1 — the everyday "turn the system on" script. It does NOT install dependencies or
# rebuild the frontend — it just starts the already-built app, which is fast (seconds, not
# minutes). Run .\deploy.ps1 first (and again after every code change); after that, this is
# all you need for every restart or reboot.
#
# Usage:
#   .\start.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$dist = Join-Path $root "dist"
$distIndex = Join-Path $dist "index.html"

if (-not (Test-Path $distIndex)) {
  Write-Host "dist/index.html not found — the frontend has never been built on this machine." -ForegroundColor Yellow
  Write-Host "Run .\deploy.ps1 once first, then re-run .\start.ps1." -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path (Join-Path $root "backend\node_modules"))) {
  Write-Host "backend\node_modules not found — dependencies were never installed on this machine." -ForegroundColor Yellow
  Write-Host "Run .\deploy.ps1 once first, then re-run .\start.ps1." -ForegroundColor Yellow
  exit 1
}

$env:NODE_ENV = "production"

Write-Host "==> Starting VOBISS (serving the already-built dist/ + API on the backend)..." -ForegroundColor Cyan
Set-Location (Join-Path $root "backend")
node server.js
