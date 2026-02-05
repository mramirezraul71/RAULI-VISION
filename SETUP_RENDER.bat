@echo off
echo === RAULI-VISION - Setup Render (espejo-backend) ===
echo.

cd /d "%~dp0"

echo 1. Verificando render.yaml...
if not exist render.yaml (
    echo [ERROR] render.yaml no encontrado
    pause
    exit /b 1
)
echo    OK
echo.

echo 2. Desea hacer git push para que Render detecte cambios?
set /p do_push="   (s/n): "
if /i "%do_push%"=="s" (
    git add -A
    git status
    set /p msg="   Mensaje commit (Enter=deploy): "
    if "%msg%"=="" set msg=chore: deploy espejo-backend
    git commit -m "%msg%"
    git push origin main
    echo [OK] Push realizado. Render redeploy automatico en 1-2 min.
) else (
    echo    Omitido.
)
echo.

echo 3. Disparar deploy manual (si ya configuraste Deploy Hook)?
set /p do_deploy="   (s/n): "
if /i "%do_deploy%"=="s" (
    python scripts\deploy_render_espejo.py
) else (
    echo    Omitido.
)
echo.

echo 4. Verificar espejo (espera 2 min si acabas de desplegar)
set /p do_verify="   (s/n): "
if /i "%do_verify%"=="s" (
    powershell -ExecutionPolicy Bypass -File scripts\verificar-render.ps1
)
echo.
echo === Fin ===
pause
