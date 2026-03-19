@echo off
set PORT=3000
set ESPEJO_URL=http://localhost:8080
set CLIENT_ID=rauli-local
set CLIENT_SECRET=rauli-local-secret
set CGO_ENABLED=0
cd /d %~dp0
rauli-proxy.exe
