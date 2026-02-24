@echo off
setlocal
set "PROJECT_DIR=%~dp0dashboard"
set "NODE_BIN=%~dp0nodejs"

if not exist "%PROJECT_DIR%" (
  echo Dashboard project not found at %PROJECT_DIR%
  exit /b 1
)

set "PATH=%NODE_BIN%;%PATH%"
pushd "%PROJECT_DIR%"
pwsh -NoExit -Command ^
  "Set-Location '%PROJECT_DIR%';" ^
  "$env:PATH='%NODE_BIN%;' + $env:PATH;" ^
  "npm run dev"
popd
