@echo off
setlocal
cd /d "%~dp0"
set "NODE_VERSION=v24.14.0"
set "NODE_FOLDER=node-%NODE_VERSION%-win-x64"
set "NODE_HOME=%CD%\.tools\node\%NODE_FOLDER%"
set "ROOT_SHORT=%~sdp0"
set "ROOT_URI=%ROOT_SHORT:\=/%"
if "%ROOT_URI:~-1%"=="/" set "ROOT_URI=%ROOT_URI:~0,-1%"

if not exist "%NODE_HOME%\node.exe" (
  echo ERROR: Node portable no encontrado. Ejecuta primero run-local.cmd
  endlocal
  exit /b 1
)

set "PATH=%NODE_HOME%;%PATH%"
set "DATABASE_URL=file:%ROOT_URI%/dev.db"

if "%~1"=="" (
  echo Uso: with-node.cmd comando [args...]
  endlocal
  exit /b 1
)

call %*
set EXIT_CODE=%ERRORLEVEL%
endlocal & exit /b %EXIT_CODE%
