@echo off
REM Abre Google Play Console para subir RAULI-VISION
REM El AAB debe generarse antes con: CADENA_COMPLETA.bat

echo.
echo === RAULI-VISION - Subir a Play Store ===
echo.
echo 1. Asegurate de tener JAVA_HOME configurado y el AAB generado:
echo    set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17
echo    CADENA_COMPLETA.bat
echo.
echo 2. AAB generado en:
echo    dashboard\android\app\build\outputs\bundle\release\app-release.aab
echo.
echo 3. Abriendo Play Console...
echo.

start https://play.google.com/console

echo.
echo En Play Console:
echo   - Selecciona RAULI-VISION (o crea la app si es primera vez)
echo   - Ve a: Produccion ^> Crear nueva version ^> Cargar
echo   - Sube: app-release.aab
echo   - Lista de probadores: docs\PLAY_STORE_TESTERS.txt
echo.
pause
