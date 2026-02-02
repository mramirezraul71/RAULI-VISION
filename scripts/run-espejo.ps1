# Ejecutar servidor espejo (VPS)
$env:PORT = "8080"
$env:JWT_SECRET = "rauli-vision-espejo-secret-change-in-production"
$env:ADMIN_TOKEN = "rauli-admin-local"
$env:ACCESS_STORE = "data/access-store.json"
Set-Location "$PSScriptRoot\..\espejo"
go run ./cmd/server
Set-Location $PSScriptRoot
