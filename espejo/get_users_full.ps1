$f = 'C:\ATLAS_PUSH\_external\RAULI-VISION\espejo\data\access-store.json'
$j = Get-Content $f -Raw | ConvertFrom-Json
$j.users.PSObject.Properties.Value | Select-Object name, status, access_code, email, phone | Format-Table -AutoSize
