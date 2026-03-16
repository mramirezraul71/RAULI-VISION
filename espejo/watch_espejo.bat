@echo off
:: watch_espejo.bat — Monitor y auto-reinicio del espejo RAULI-VISION
:: Verifica cada 60s que /api/tiktok/trending responde con videos.
:: Si falla 3 veces consecutivas, reinicia espejo.exe automáticamente.
::
:: Uso: Ejecutar en segundo plano (doble click o START /B watch_espejo.bat)
::      Para detener: cerrar la ventana o Ctrl+C

setlocal enabledelayedexpansion

set ESPEJO_DIR=%~dp0
set ESPEJO_EXE=%ESPEJO_DIR%espejo.exe
set ESPEJO_BAT=%ESPEJO_DIR%run_espejo.bat
set API_URL=http://127.0.0.1:8080/api/tiktok/trending
set CHECK_INTERVAL=60
set MAX_FAILS=3
set FAIL_COUNT=0

echo [watch_espejo] Iniciando monitor RAULI-VISION espejo...
echo [watch_espejo] API: %API_URL%
echo [watch_espejo] Intervalo: %CHECK_INTERVAL%s — Reinicio tras %MAX_FAILS% fallos consecutivos

:loop
timeout /t %CHECK_INTERVAL% /nobreak >nul

:: Verificar que espejo está corriendo
tasklist /fi "imagename eq espejo.exe" 2>nul | find /i "espejo.exe" >nul
if errorlevel 1 (
    echo [watch_espejo] espejo.exe NO está corriendo — arrancando...
    start "" "%ESPEJO_BAT%"
    set FAIL_COUNT=0
    goto loop
)

:: Consultar el endpoint TikTok trending
for /f %%i in ('powershell -command "try { $r = Invoke-WebRequest -Uri '%API_URL%' -TimeoutSec 15 -UseBasicParsing; $j = $r.Content | ConvertFrom-Json; if ($j.items -and $j.items.Count -gt 0) { Write-Output 'ok' } else { Write-Output 'empty' } } catch { Write-Output 'fail' }"') do set RESULT=%%i

if "%RESULT%"=="ok" (
    echo [watch_espejo] OK — TikTok trending operativo
    set FAIL_COUNT=0
    goto loop
)

set /a FAIL_COUNT=FAIL_COUNT+1
echo [watch_espejo] FALLO %FAIL_COUNT%/%MAX_FAILS% — respuesta: %RESULT%

if %FAIL_COUNT% geq %MAX_FAILS% (
    echo [watch_espejo] Reiniciando espejo.exe...
    taskkill /f /im espejo.exe >nul 2>&1
    timeout /t 3 /nobreak >nul
    start "" "%ESPEJO_BAT%"
    set FAIL_COUNT=0
    echo [watch_espejo] Espejo reiniciado. Esperando %CHECK_INTERVAL%s...
)

goto loop
