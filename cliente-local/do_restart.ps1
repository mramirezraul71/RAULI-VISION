$dir = 'C:\ATLAS_PUSH\_external\RAULI-VISION\cliente-local'

$proc = Get-Process -Name 'rauli-proxy' -ErrorAction SilentlyContinue
if ($proc) {
    Write-Host "Stopping rauli-proxy PID $($proc.Id)"
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

Copy-Item "$dir\rauli-proxy-new.exe" "$dir\rauli-proxy.exe" -Force
Write-Host "Binary updated"

Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"$dir\start_proxy.bat`"" -WorkingDirectory $dir -WindowStyle Normal
Start-Sleep -Seconds 4

$newProc = Get-Process -Name 'rauli-proxy' -ErrorAction SilentlyContinue
if ($newProc) {
    Write-Host "OK: rauli-proxy PID $($newProc.Id)"
} else {
    Write-Host "Not detected yet"
}
