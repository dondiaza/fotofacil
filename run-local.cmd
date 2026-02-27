@echo off
setlocal
cd /d "%~dp0"

set "NODE_VERSION=v24.14.0"
set "NODE_FOLDER=node-%NODE_VERSION%-win-x64"
set "NODE_HOME=%CD%\.tools\node\%NODE_FOLDER%"
set "NODE_ZIP=%CD%\.tools\node\node.zip"

echo [1/7] Preparando Node portable...
if not exist "%NODE_HOME%\node.exe" (
  if not exist "%CD%\.tools" mkdir "%CD%\.tools"
  if not exist "%CD%\.tools\node" mkdir "%CD%\.tools\node"
  echo Descargando Node %NODE_VERSION%...
  C:\Windows\System32\curl.exe -L https://nodejs.org/dist/%NODE_VERSION%/%NODE_FOLDER%.zip -o "%NODE_ZIP%"
  if errorlevel 1 (
    echo ERROR: No se pudo descargar Node.
    pause
    exit /b 1
  )
  echo Extrayendo Node...
  C:\Windows\System32\tar.exe -xf "%NODE_ZIP%" -C "%CD%\.tools\node"
  if errorlevel 1 (
    echo ERROR: No se pudo extraer Node.
    pause
    exit /b 1
  )
)

set "PATH=%NODE_HOME%;%PATH%"

echo [2/7] Verificando Node y npm...
node -v >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node no disponible tras la instalacion portable.
  pause
  exit /b 1
)
call npm -v >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm no disponible tras la instalacion portable.
  pause
  exit /b 1
)

echo [3/7] Preparando .env...
if not exist ".env" (
  copy ".env.example" ".env" >nul
  if errorlevel 1 (
    echo ERROR: No se pudo crear .env desde .env.example
    pause
    exit /b 1
  )
)

echo [4/7] Instalando dependencias...
call npm install
if errorlevel 1 (
  echo ERROR: npm install fallo.
  pause
  exit /b 1
)

echo [5/7] Preparando base de datos SQLite...
call npm run setup
if errorlevel 1 (
  echo ERROR: setup de base de datos fallo.
  echo Revisa DATABASE_URL en .env.
  pause
  exit /b 1
)

echo [6/7] Verificando salud local...
node -e "console.log('Node OK')"
if errorlevel 1 (
  echo ERROR: verificacion de runtime fallo.
  pause
  exit /b 1
)

if /I "%~1"=="--setup-only" (
  echo Setup completado.
  endlocal
  exit /b 0
)

echo [7/7] Levantando app...
echo.
echo URL local:    http://127.0.0.1:3000/login
echo URL red local: http://localhost:3000/login
echo.
call npm run dev

endlocal
