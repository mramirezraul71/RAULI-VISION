# Verifica que espejo-backend en Render responda OK.
# Arquitectura profesional: solo espejo (sin proxy).
# Ejecutar: .\scripts\verificar-render.ps1

$ErrorActionPreference = "Continue"
$urlEspejo = "https://espejo-backend.onrender.com/api/health"
$timeoutSec = 90

Write-Host "Verificando espejo-backend (timeout ${timeoutSec}s por cold start)..." -ForegroundColor Cyan

$okEspejo = $false
try {
    $r = Invoke-WebRequest -Uri $urlEspejo -UseBasicParsing -TimeoutSec $timeoutSec
    if ($r.StatusCode -eq 200) {
        $okEspejo = $true
        $body = $r.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
        $ver = if ($body.version) { " v$($body.version)" } else { "" }
        Write-Host "  Espejo: OK$ver" -ForegroundColor Green
    } else {
        Write-Host "  Espejo: $($r.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  Espejo: Error o timeout - $($_.Exception.Message)" -ForegroundColor Red
}

if ($okEspejo) {
    Write-Host ""
    Write-Host "DESPLIEGUE RENDER OK" -ForegroundColor Green
    Write-Host "  Espejo: $urlEspejo" -ForegroundColor Gray
    Write-Host "  Cloudflare: https://puente-rauli-vision.mramirezraul71.workers.dev" -ForegroundColor Gray
    exit 0
} else {
    Write-Host ""
    Write-Host "Espejo no respondio OK. Revisa el Dashboard de Render." -ForegroundColor Yellow
    Write-Host "  https://dashboard.render.com" -ForegroundColor Gray
    Write-Host "  Ver RENDER_SETUP_ESPEJO.md para configurar." -ForegroundColor Gray
    exit 1
}
