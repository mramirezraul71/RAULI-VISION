@echo off
REM Proceso completo: bump + build + AAB + subir a Play Store via API
REM Credenciales en: credenciales.txt (GOOGLE_PLAY_CREDENTIALS_PATH)

cd /d "%~dp0"
python scripts\proceso_completo_play_store.py %*
pause
