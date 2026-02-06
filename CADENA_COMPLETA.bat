@echo off
REM Cadena completa RAULI-VISION: bump + build + AAB + (opcional) push
REM Uso: CADENA_COMPLETA.bat           ^& REM bump + build + AAB
REM      CADENA_COMPLETA.bat --push    ^& REM + git push
REM      CADENA_COMPLETA.bat --todo    ^& REM + deploy-network + push
REM      CADENA_COMPLETA.bat --solo-build ^& REM solo build sin bump

cd /d "%~dp0"
python scripts\cadena_completa.py %*
pause
