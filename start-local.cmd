@echo off
setlocal
cd /d "%~dp0"
set "ROOT_SHORT=%~sdp0"

start "fotofacil-dev" /min C:\Windows\System32\cmd.exe /c "%ROOT_SHORT%run-local.cmd"
echo servidor iniciado en segundo plano.
echo comprueba en 20-40 segundos: http://127.0.0.1:3000/api/health
endlocal
