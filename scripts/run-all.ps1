# Inicia Espejo (8080) y Proxy (3000) en ventanas nuevas. Abre el navegador al proxy.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path

Write-Host "Abriendo Espejo (puerto 8080) y Proxy (puerto 3000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\espejo'; `$env:PORT='8080'; `$env:JWT_SECRET='rauli-vision-espejo-secret'; go run ./cmd/server"
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\cliente-local'; `$env:PORT='3000'; `$env:ESPEJO_URL='http://localhost:8080'; `$env:CLIENT_ID='rauli-local'; `$env:CLIENT_SECRET='rauli-local-secret'; go run ./cmd/proxy"
Start-Sleep -Seconds 4
Write-Host "Dashboard: http://localhost:3000" -ForegroundColor Green
Start-Process "http://localhost:3000"
