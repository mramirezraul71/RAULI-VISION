# Notifica por Telegram (carga credenciales desde la Bóveda).
# Uso: .\notify-telegram.ps1 "Mensaje aquí"
# Requiere en credenciales: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (o BOT_TOKEN, CHAT_ID)

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
            if ($key -match 'TELEGRAM.*BOT|BOT.*TOKEN') { $token = $val }
            if ($key -match 'TELEGRAM.*CHAT|CHAT.*ID') { $chatId = $val }
        }
    }
    if ($token -and $chatId) { break }
}

if (-not $token -or -not $chatId) {
    Write-Warning "No se encontraron TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en la Bóveda. Omitting Telegram."
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
