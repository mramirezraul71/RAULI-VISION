@echo off
REM Build RAULI-VISION para Google Play Store (AAB)
REM Requiere: keystore.properties y rauli-vision-upload.keystore en dashboard/android

setlocal
cd /d "%~dp0.."

echo [1/4] Bump version...
python scripts/bump_version.py
if errorlevel 1 (
    echo Error en bump_version
    exit /b 1
)

echo [2/4] Build web...
cd dashboard
call npm run build
if errorlevel 1 (
    echo Error en npm run build
    exit /b 1
)

echo [3/4] Sync Capacitor...
call npx cap sync android
if errorlevel 1 (
    echo Error en cap sync
    exit /b 1
)

echo [4/4] Gradle bundleRelease...
cd android
call gradlew.bat bundleRelease
if errorlevel 1 (
    echo Error en gradle bundleRelease
    exit /b 1
)

echo.
echo *** AAB generado en: dashboard\android\app\build\outputs\bundle\release\app-release.aab ***
pause
