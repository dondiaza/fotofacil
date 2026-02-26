@echo off
setlocal
for /f "tokens=5" %%a in ('C:\Windows\System32\netstat.exe -ano ^| C:\Windows\System32\findstr.exe :3000 ^| C:\Windows\System32\findstr.exe LISTENING') do (
  C:\Windows\System32\taskkill.exe /PID %%a /F >nul 2>&1
)
echo procesos en puerto 3000 detenidos.
endlocal
