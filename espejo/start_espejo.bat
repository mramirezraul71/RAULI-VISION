@echo off
set PORT=8080
set JWT_SECRET=rauli-vision-espejo-secret
set ADMIN_TOKEN=rauli-admin-local
set ACCESS_STORE=data\access-store.json
"%~dp0espejo.exe"
