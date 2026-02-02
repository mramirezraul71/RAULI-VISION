# Verifica que los servicios RAULI-VISION en Render respondan OK.
# Ejecutar: .\scripts\verificar-render.ps1
# Si Render usa otros nombres, edita $urlEspejo y $urlProxy abajo.

$ErrorActionPreference = "Continue"
$urlEspejo = "https://espejo-backend.onrender.com/api/health"
$urlProxy  = "https://proxy-backend.onrender.com/api/health"
$timeoutSec = 90

Write-Host "Verificando Render (timeout ${timeoutSec}s por cold start)..." -ForegroundColor Cyan

$okEspejo = $false
$okProxy  = $false

try {
    $r = Invoke-WebRequest -Uri $urlEspejo -UseBasicParsing -TimeoutSec $timeoutSec
    if ($r.StatusCode -eq 200) { $okEspejo = $true; Write-Host "  Espejo: OK" -ForegroundColor Green } else { Write-Host "  Espejo: $($r.StatusCode)" -ForegroundColor Yellow }
} catch {
    Write-Host "  Espejo: Error o timeout - $($_.Exception.Message)" -ForegroundColor Red
}

try {
    $r = Invoke-WebRequest -Uri $urlProxy -UseBasicParsing -TimeoutSec $timeoutSec
    if ($r.StatusCode -eq 200) { $okProxy = $true; Write-Host "  Proxy:  OK" -ForegroundColor Green } else { Write-Host "  Proxy:  $($r.StatusCode)" -ForegroundColor Yellow }
} catch {
    Write-Host "  Proxy:  Error o timeout - $($_.Exception.Message)" -ForegroundColor Red
}

if ($okEspejo -and $okProxy) {
    Write-Host ""
    Write-Host "DESPLIEGUE RENDER OK" -ForegroundColor Green
    Write-Host "  Espejo: $urlEspejo" -ForegroundColor Gray
    Write-Host "  Proxy:  $urlProxy" -ForegroundColor Gray
    Write-Host "  Dashboard: $($urlProxy -replace '/api/health','')" -ForegroundColor Gray
    exit 0
} else {
    Write-Host ""
    Write-Host "Alguno de los servicios no respondio OK. Revisa el Dashboard de Render." -ForegroundColor Yellow
    Write-Host "  https://dashboard.render.com" -ForegroundColor Gray
    exit 1
}
