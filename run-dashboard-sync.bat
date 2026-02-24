@echo off
setlocal
set "ROOT_DIR=%~dp0"
set "PROJECT_DIR=%ROOT_DIR%dashboard"
set "NODE_BIN=%ROOT_DIR%nodejs"

if not exist "%PROJECT_DIR%" (
  echo Dashboard project not found at %PROJECT_DIR%
  exit /b 1
)

if not exist "%PROJECT_DIR%\.env.local" (
  if exist "%PROJECT_DIR%\.env.example" (
    copy /Y "%PROJECT_DIR%\.env.example" "%PROJECT_DIR%\.env.local" >nul
    echo Created %PROJECT_DIR%\.env.local from .env.example
  )
)

set "PATH=%NODE_BIN%;%PATH%"
pushd "%PROJECT_DIR%"
call npm run fetch:odoo
if errorlevel 1 (
  echo.
  echo Odoo sync failed. Check credentials in dashboard\.env.local
  popd
  exit /b 1
)
call npm run build
popd

echo.
echo Sync and build completed.
exit /b 0
