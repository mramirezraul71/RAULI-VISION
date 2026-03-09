param(
  [string]$ApiBase = "http://localhost:3000",
  [switch]$SkipTests,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$espejoDir = Join-Path $root "espejo"
$proxyDir = Join-Path $root "cliente-local"
$dashboardDir = Join-Path $root "dashboard"
$proxyStaticDir = Join-Path $proxyDir "static"

Write-Host "[INSTALL] RAULI-VISION instalacion profesional" -ForegroundColor Cyan
Write-Host "[INSTALL] Root: $root" -ForegroundColor DarkGray

if (-not $SkipTests) {
  Write-Host "[INSTALL] Ejecutando tests de Espejo..." -ForegroundColor Yellow
  Push-Location $espejoDir
  go test ./...
  Pop-Location

  Write-Host "[INSTALL] Ejecutando tests de Proxy..." -ForegroundColor Yellow
  Push-Location $proxyDir
  go test ./...
  Pop-Location
}

if (-not $SkipBuild) {
  Write-Host "[INSTALL] Build del dashboard..." -ForegroundColor Yellow
  Push-Location $dashboardDir
  npm run build
  Pop-Location

  Write-Host "[INSTALL] Copiando dashboard compilado a cliente-local/static..." -ForegroundColor Yellow
  if (Test-Path $proxyStaticDir) {
    Remove-Item $proxyStaticDir -Recurse -Force
  }
  New-Item -ItemType Directory -Path $proxyStaticDir -Force | Out-Null
  Copy-Item (Join-Path $dashboardDir "dist\\*") $proxyStaticDir -Recurse -Force
}

Write-Host "[INSTALL] Smoke health API..." -ForegroundColor Yellow
try {
  $health = Invoke-RestMethod -Uri "$ApiBase/api/health" -TimeoutSec 20
  Write-Host "[INSTALL] Health OK: status=$($health.status) espejo=$($health.espejo)" -ForegroundColor Green
} catch {
  Write-Host "[INSTALL] Health no disponible en $ApiBase/api/health (arranque servicios y reintente)." -ForegroundColor Red
}

Write-Host "[INSTALL] Smoke TV channels..." -ForegroundColor Yellow
try {
  & (Join-Path $PSScriptRoot "check-tv-channels.ps1") -ApiBase $ApiBase -Mode cuba -Max 12
} catch {
  Write-Host "[INSTALL] No se pudo completar chequeo TV: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "[INSTALL] Instalacion profesional completada." -ForegroundColor Green
