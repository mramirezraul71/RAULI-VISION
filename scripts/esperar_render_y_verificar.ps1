# Espera a que espejo-backend esté activo en Render y verifica.
# Ejecutar después de conectar el Blueprint en Render.
# Uso: .\scripts\esperar_render_y_verificar.ps1

$url = "https://espejo-backend.onrender.com/api/health"
$maxAttempts = 20
$delaySec = 15

Write-Host "Esperando espejo-backend (hasta $($maxAttempts * $delaySec / 60) min)..." -ForegroundColor Cyan
Write-Host "  Si aun no conectaste el Blueprint: https://dashboard.render.com/select-repo?type=blueprint" -ForegroundColor Gray
Write-Host ""

for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
        if ($r.StatusCode -eq 200) {
            $body = $r.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
            $ver = if ($body.version) { " v$($body.version)" } else { "" }
            Write-Host ""
            Write-Host "ESPEJO-BACKEND OK$ver" -ForegroundColor Green
            Write-Host "  $url" -ForegroundColor Gray
            Write-Host "  Cloudflare: https://puente-rauli-vision.mramirezraul71.workers.dev" -ForegroundColor Gray
            exit 0
        }
    } catch {
        Write-Host "  Intento $i/$maxAttempts - esperando ${delaySec}s..." -ForegroundColor Yellow
    }
    Start-Sleep -Seconds $delaySec
}

Write-Host ""
Write-Host "Timeout. Revisa el Dashboard de Render." -ForegroundColor Red
exit 1
