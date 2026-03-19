$f = 'C:\ATLAS_PUSH\_external\RAULI-VISION\espejo\data\access-store.json'
if (Test-Path $f) {
    $j = Get-Content $f -Raw | ConvertFrom-Json
    Write-Host "USUARIOS:"
    $j.users.PSObject.Properties.Value | Select-Object name, status, access_code | Format-Table -AutoSize
} else {
    Write-Host "No encontrado"
    Get-ChildItem 'C:\ATLAS_PUSH\_external\RAULI-VISION\espejo\data' -ErrorAction SilentlyContinue
}
