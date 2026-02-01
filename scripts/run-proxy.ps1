# Ejecutar cliente local (proxy). Requiere espejo en http://localhost:8080
$env:PORT = "3000"
$env:ESPEJO_URL = "http://localhost:8080"
$env:CLIENT_ID = "rauli-local"
$env:CLIENT_SECRET = "rauli-local-secret"
Set-Location "$PSScriptRoot\..\cliente-local"
go run ./cmd/proxy
Set-Location $PSScriptRoot
