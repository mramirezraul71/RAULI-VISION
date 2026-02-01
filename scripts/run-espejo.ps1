# Ejecutar servidor espejo (VPS)
$env:PORT = "8080"
$env:JWT_SECRET = "rauli-vision-espejo-secret-change-in-production"
Set-Location "$PSScriptRoot\..\espejo"
go run ./cmd/server
Set-Location $PSScriptRoot
