@echo off
REM 🚀 Quick Update Script - Windows Batch
REM Actualización rápida con doble clic

echo 🚀 RAULI-VISION Quick Update
echo.

REM Verificar PowerShell
powershell -Command "Get-Host" >nul 2>&1
if errorlevel 1 (
    echo ❌ PowerShell no disponible
    pause
    exit /b 1
)

REM Ejecutar script principal
powershell -ExecutionPolicy Bypass -File ".\scripts\auto-update.ps1" -Environment "production" -SkipTests

if errorlevel 1 (
    echo.
    echo ❌ Error en actualización
    pause
    exit /b 1
) else (
    echo.
    echo ✅ Actualización completada
    pause
)
