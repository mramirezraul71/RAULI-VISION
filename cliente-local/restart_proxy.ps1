$dir = 'C:\ATLAS_PUSH\_external\RAULI-VISION\cliente-local'

# Kill old proxy
$proc = Get-Process -Name 'rauli-proxy' -ErrorAction SilentlyContinue
if ($proc) {
    Write-Host "Killing rauli-proxy PID $($proc.Id)"
    Stop-Process -Id $proc.Id -Force
    Start-Sleep -Seconds 2
}

# Replace binary
Copy-Item "$dir\rauli-proxy-new.exe" "$dir\rauli-proxy.exe" -Force
Write-Host "Binary replaced"

# Find start script
$startScript = Get-ChildItem $dir -Filter 'start_proxy*.bat' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($startScript) {
    Write-Host "Starting via $($startScript.Name)"
    Start-Process cmd.exe -ArgumentList "/c `"$($startScript.FullName)`"" -WorkingDirectory $dir -WindowStyle Normal
} else {
    # Try to run directly with env from start_espejo companion
    $envFile = Get-ChildItem $dir -Filter '*.env' -ErrorAction SilentlyContinue | Select-Object -First 1
    Write-Host "No start script found, starting directly"
    Start-Process "$dir\rauli-proxy.exe" -WorkingDirectory $dir -WindowStyle Normal
}

Start-Sleep -Seconds 3
$newProc = Get-Process -Name 'rauli-proxy' -ErrorAction SilentlyContinue
if ($newProc) {
    Write-Host "OK: rauli-proxy running PID $($newProc.Id)"
} else {
    Write-Host "WARNING: rauli-proxy not detected yet"
}
