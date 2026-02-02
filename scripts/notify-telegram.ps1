# Notifica por Telegram (carga credenciales desde la Bóveda).
# Uso: .\notify-telegram.ps1 "Mensaje aquí"
# Bóveda: TELEGRAM_TOKEN o TELEGRAM_BOT_TOKEN; TELEGRAM_ADMIN_CHAT_ID, TELEGRAM_CHAT_ID o TELEGRAM_APPROVAL_CHAT_ID

param([Parameter(Mandatory=$true)][string]$Message)

$vaultPaths = @(
    "C:\dev\credenciales.txt",
    "$env:USERPROFILE\OneDrive\RAUL - Personal\Escritorio\credenciales.txt",
    "C:\Users\Raul\OneDrive\RAUL - Personal\Escritorio\credenciales.txt"
)

$token = $null
$chatId = $null

foreach ($path in $vaultPaths) {
    if (-not (Test-Path $path)) { continue }
    Get-Content $path -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim().Trim('"').Trim("'")
            if ($key -eq 'TELEGRAM_TOKEN' -or $key -eq 'TELEGRAM_BOT_TOKEN' -or $key -match 'BOT.*TOKEN') { $token = $val }
            if ($key -eq 'TELEGRAM_ADMIN_CHAT_ID' -or $key -eq 'TELEGRAM_CHAT_ID' -or $key -eq 'TELEGRAM_APPROVAL_CHAT_ID' -or $key -match 'TELEGRAM.*CHAT.*ID') { $chatId = $val }
        }
    }
    if ($token -and $chatId) { break }
}

if (-not $token -or -not $chatId) {
    Write-Warning "No se encontraron token/chat de Telegram en la Bóveda (TELEGRAM_TOKEN, TELEGRAM_ADMIN_CHAT_ID, etc.)."
    exit 0
}

$body = @{ chat_id = $chatId; text = $Message; parse_mode = "HTML" } | ConvertTo-Json
$uri = "https://api.telegram.org/bot$token/sendMessage"
try {
    Invoke-RestMethod -Uri $uri -Method Post -Body $body -ContentType "application/json; charset=utf-8"
    Write-Host "Telegram: mensaje enviado."
} catch {
    Write-Warning "Telegram: fallo al enviar - $_"
}
