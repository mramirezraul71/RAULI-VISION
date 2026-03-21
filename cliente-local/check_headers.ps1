$resp = Invoke-WebRequest -Uri 'http://localhost:3000/' -UseBasicParsing -Method GET
Write-Host "Cache-Control: $($resp.Headers['Cache-Control'])"
Write-Host "Cloudflare-CDN-Cache-Control: $($resp.Headers['Cloudflare-CDN-Cache-Control'])"
Write-Host "CDN-Cache-Control: $($resp.Headers['CDN-Cache-Control'])"
Write-Host "Pragma: $($resp.Headers['Pragma'])"
