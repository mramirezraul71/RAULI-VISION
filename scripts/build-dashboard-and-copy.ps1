# Build dashboard React y copiar a cliente-local/static para servir desde el proxy
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location "$root\dashboard"
if (-not (Test-Path "node_modules")) { npm install }
npm run build
if (-not (Test-Path "dist")) { Write-Error "Build no generó dist/" }
Remove-Item "$root\cliente-local\static\*" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Recurse "dist\*" "$root\cliente-local\static\"
Write-Host "Dashboard construido y copiado a cliente-local/static" -ForegroundColor Green
Set-Location $root
