# deploy.ps1 — run this ONLY when the code has changed (after a git pull, or before the
# first-ever start on a new server). It installs dependencies and rebuilds the frontend.
#
# This is the slow step (can take a few minutes) — that cost belongs here, once per code
# change, never on every restart. Use start.ps1 for the fast, everyday "turn it on" step.
#
# Usage:
#   .\deploy.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "==> Installing frontend dependencies..." -ForegroundColor Cyan
Set-Location $root
npm install
if ($LASTEXITCODE -ne 0) { throw "Frontend npm install failed" }

Write-Host "==> Building frontend (this can take a couple of minutes)..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }

Write-Host "==> Installing backend dependencies..." -ForegroundColor Cyan
Set-Location (Join-Path $root "backend")
npm install
if ($LASTEXITCODE -ne 0) { throw "Backend npm install failed" }

Set-Location $root
Write-Host ""
Write-Host "==> Deploy complete. dist/ is rebuilt and dependencies are current." -ForegroundColor Green
Write-Host "    Run .\start.ps1 to start the server — it will be fast from now on." -ForegroundColor Green
