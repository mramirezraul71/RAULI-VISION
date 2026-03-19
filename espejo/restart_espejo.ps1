# restart_espejo.ps1

# 1) Eliminar entradas HKCU\Run relacionadas con espejo/watchdog
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$entries = Get-ItemProperty -Path $runKey -ErrorAction SilentlyContinue
$entries.PSObject.Properties | Where-Object { $_.Value -like "*espejo*" -or $_.Value -like "*watchdog*" -or $_.Value -like "*sentinel*" -or $_.Value -like "*RAULI*" } | ForEach-Object {
    Write-Host "Eliminando entrada Run: $($_.Name)"
    Remove-ItemProperty -Path $runKey -Name $_.Name -ErrorAction SilentlyContinue
}

# 2) Matar procesos watchdog de espejo
Get-WmiObject Win32_Process | Where-Object {
    ($_.Name -match "powershell|python") -and ($_.CommandLine -match "espejo|watchdog|sentinel|RAULI-VISION")
} | ForEach-Object {
    Write-Host "Matando watchdog PID $($_.ProcessId)"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

# 3) Matar espejo.exe
$espejo = Get-Process -Name "espejo" -ErrorAction SilentlyContinue
if ($espejo) {
    Write-Host "Matando espejo PID $($espejo.Id)..."
    Stop-Process -Id $espejo.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# Verificar con WMI si sigue vivo
$still = Get-Process -Name "espejo" -ErrorAction SilentlyContinue
if ($still) {
    Write-Host "Intentando WMI Terminate en PID $($still.Id)..."
    $wmi = Get-WmiObject Win32_Process -Filter "ProcessId = $($still.Id)"
    if ($wmi) { $wmi.Terminate() | Out-Null }
    Start-Sleep -Seconds 2
}

$still2 = Get-Process -Name "espejo" -ErrorAction SilentlyContinue
if ($still2) {
    Write-Host "ERROR: No se pudo matar espejo PID $($still2.Id). Abortando."
    exit 1
}

Write-Host "espejo detenido OK."

# 4) Iniciar nuevo espejo
$batPath = "C:\ATLAS_PUSH\_external\RAULI-VISION\espejo\start_espejo.bat"
Write-Host "Iniciando espejo con start_espejo.bat..."
Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$batPath`"" -WorkingDirectory "C:\ATLAS_PUSH\_external\RAULI-VISION\espejo" -WindowStyle Normal

Start-Sleep -Seconds 4
$newEspejo = Get-Process -Name "espejo" -ErrorAction SilentlyContinue
if ($newEspejo) {
    Write-Host "OK: espejo iniciado PID $($newEspejo.Id)"
} else {
    Write-Host "AVISO: espejo.exe no visible aun (puede estar arrancando en cmd)"
}
