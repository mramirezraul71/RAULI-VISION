@echo off
REM Crea keystore para firmar RAULI-VISION (solo primera vez)
REM El keystore y keystore.properties deben estar en dashboard/android/

cd /d "%~dp0..\dashboard\android"

REM Usar Java de Android Studio si JAVA_HOME no esta definido
if not defined JAVA_HOME set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "PATH=%JAVA_HOME%\bin;%PATH%"

if exist "rauli-vision-upload.keystore" (
    echo Ya existe rauli-vision-upload.keystore
    echo Si quieres crear uno nuevo, borra el existente primero.
    pause
    exit /b 0
)

set PWD=rauli2026
echo Creando keystore con password: %PWD%
echo.

keytool -genkey -v -keystore rauli-vision-upload.keystore -alias rauli-vision -keyalg RSA -keysize 2048 -validity 10000 -storepass %PWD% -keypass %PWD% -dname "CN=RAULI-VISION, OU=Dev, O=RAULI, L=Havana, ST=CU, C=CU"

if errorlevel 1 (
    echo Error al crear keystore
    pause
    exit /b 1
)

echo.
echo Creando keystore.properties...
(
echo storePassword=%PWD%
echo keyPassword=%PWD%
echo keyAlias=rauli-vision
echo storeFile=rauli-vision-upload.keystore
) > keystore.properties

echo.
echo Listo. Keystore y keystore.properties creados.
echo Ahora ejecuta el build: CADENA_COMPLETA.bat o proceso_completo
pause
