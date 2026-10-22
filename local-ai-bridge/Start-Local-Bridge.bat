@echo off
setlocal
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required. Install it from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
node --version
node --experimental-strip-types local-ai-bridge/server.mjs
if errorlevel 1 pause
endlocal
