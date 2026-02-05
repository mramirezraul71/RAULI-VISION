@echo off
echo === Actualizar cadena - RAULI-VISION ===
echo    (Sin Google Play - app aun no publicada)
echo.

cd /d "%~dp0"
python scripts\bump_version.py --today
if errorlevel 1 (
    echo Error al actualizar version.
    pause
    exit /b 1
)

set /p do_network="Desplegar puente Cloudflare? (s/n): "
if /i "%do_network%"=="s" (
    node deploy_network.js
)

set /p do_push="Hacer git push? (s/n): "
if /i "%do_push%"=="s" (
    git add -A
    git commit -m "chore: bump version RAULI-VISION"
    git push
    echo [OK] Push realizado. Render + Vercel desplegaran.
)

echo.
echo === Listo ===
pause
