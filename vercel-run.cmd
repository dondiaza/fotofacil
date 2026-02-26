@echo off
setlocal
if not defined VERCEL_TOKEN (
  echo ERROR: VERCEL_TOKEN no esta definido en el entorno.
  endlocal
  exit /b 1
)

cd /d "%~dp0"
call with-node.cmd npx vercel %* --token %VERCEL_TOKEN%
set EXIT_CODE=%ERRORLEVEL%
endlocal & exit /b %EXIT_CODE%
