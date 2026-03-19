$camiCount = (Get-ChildItem 'C:\ATLAS_PUSH\_external\RAULI-VISION\espejo\storage\vault\cami\peliculas' -ErrorAction SilentlyContinue | Measure-Object).Count
$variadoCount = (Get-ChildItem 'C:\ATLAS_PUSH\_external\RAULI-VISION\espejo\storage\vault\variado\peliculas' -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "CAMI/peliculas: $camiCount archivos"
Write-Host "Variado/peliculas: $variadoCount archivos"

if (Test-Path 'C:\ATLAS_PUSH\_external\RAULI-VISION\espejo\seed_peliculas.log') {
    Write-Host "--- Log (ultimas 5 lineas) ---"
    Get-Content 'C:\ATLAS_PUSH\_external\RAULI-VISION\espejo\seed_peliculas.log' -Tail 5
}
