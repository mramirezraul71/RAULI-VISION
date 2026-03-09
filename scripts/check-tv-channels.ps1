param(
  [string]$ApiBase = "http://localhost:3000",
  [ValidateSet("cuba", "direct")]
  [string]$Mode = "cuba",
  [int]$Max = 12,
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

if ($ApiBase.EndsWith("/")) {
  $ApiBase = $ApiBase.TrimEnd("/")
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
  $logsDir = Join-Path $PSScriptRoot "..\\logs"
  New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
  $OutputPath = Join-Path $logsDir "tv_channels_health_$stamp.json"
}

$uri = "$ApiBase/api/video/channels/health?max=$Max&mode=$Mode"
Write-Host "[TV-CHECK] Consultando: $uri" -ForegroundColor Cyan

try {
  $resp = Invoke-RestMethod -Uri $uri -TimeoutSec 30
} catch {
  Write-Host "[TV-CHECK] ERROR consultando API: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

$reachable = 0
if ($resp.reachable -ne $null) {
  $reachable = [int]$resp.reachable
}
$total = 0
if ($resp.total -ne $null) {
  $total = [int]$resp.total
}

Write-Host "[TV-CHECK] Resultado: $reachable/$total accesibles (modo=$($resp.mode))" -ForegroundColor Green

if ($resp.items) {
  $resp.items |
    Select-Object id, title, reachable, status_code, latency_ms, cuba_ready |
    Format-Table -AutoSize
}

($resp | ConvertTo-Json -Depth 8) | Set-Content -Path $OutputPath -Encoding UTF8
Write-Host "[TV-CHECK] Reporte guardado en: $OutputPath" -ForegroundColor Yellow

# Exit non-zero when all channels are down.
if ($total -gt 0 -and $reachable -eq 0) {
  Write-Host "[TV-CHECK] Todos los canales estan caidos." -ForegroundColor Red
  exit 2
}

exit 0
