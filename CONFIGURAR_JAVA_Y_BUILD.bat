@echo off
REM Configura JAVA_HOME y ejecuta cadena completa para generar AAB
REM Si Java no esta instalado: https://adoptium.net/

echo.
echo === RAULI-VISION - Configurar Java y generar AAB ===
echo.

REM Rutas comunes de JDK en Windows (buscar automaticamente)
if defined JAVA_HOME (
    echo JAVA_HOME ya definido: %JAVA_HOME%
    goto :found
)
if exist "C:\Program Files\Eclipse Adoptium\jdk-17" set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17" & goto :found
if exist "C:\Program Files\Eclipse Adoptium\jdk-21" set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21" & goto :found
if exist "C:\Program Files\Java\jdk-17" set "JAVA_HOME=C:\Program Files\Java\jdk-17" & goto :found
if exist "C:\Program Files\Java\jdk-21" set "JAVA_HOME=C:\Program Files\Java\jdk-21" & goto :found

if not defined JAVA_HOME (
    echo [ERROR] JAVA_HOME no configurado y no se encontro JDK.
    echo.
    echo Instala JDK 17+ desde: https://adoptium.net/
    echo Luego ejecuta: set JAVA_HOME=C:\ruta\al\jdk
    echo.
    pause
    exit /b 1
)

:found
if not defined JAVA_HOME exit /b 1
echo Usando JAVA_HOME: %JAVA_HOME%
set "PATH=%JAVA_HOME%\bin;%PATH%"
echo.

cd /d "%~dp0"
call CADENA_COMPLETA.bat
pause
