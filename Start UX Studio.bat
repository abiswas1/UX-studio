@echo off
rem Double-click this file on Windows to start UX Studio.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js isn't installed yet.
  echo Get the LTS version from https://nodejs.org, install it, then double-click this file again.
  start https://nodejs.org
  pause
  exit /b 1
)

if not exist .env (
  echo First-time setup.
  echo Paste your Anthropic API key ^(it starts with sk-ant-^) and press Enter.
  echo Or just press Enter to try UX Studio with the sample results only.
  set /p KEY=
  call :writekey
)

if not exist node_modules (
  echo Installing ^(only the first time, takes a few minutes^)...
  call npm install || (echo Installing failed. & pause & exit /b 1)
)

if not exist .next\BUILD_ID (
  echo Preparing the app...
  call npm run build || (echo Preparing failed. & pause & exit /b 1)
)

echo.
echo UX Studio is running at http://localhost:4747
echo Keep this window open while you use it. Close it to stop UX Studio.
start "" http://localhost:4747
call npm start
exit /b 0

:writekey
if defined KEY (echo ANTHROPIC_API_KEY=%KEY%> .env) else (type nul > .env)
exit /b 0
