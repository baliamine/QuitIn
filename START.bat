@echo off
title QUITIN
color 0A
cd /d "%~dp0"

echo.
echo  ============================================
echo    QUITIN - one-command development startup
echo  ============================================
echo.

call npm run dev:up
set EXITCODE=%ERRORLEVEL%

echo.
if not "%EXITCODE%"=="0" (
  echo  Startup failed. Read the messages above.
  echo  Diagnostics: npm run dev:check
) else (
  echo  QUITIN is running:  http://localhost:3000
  echo  Stop it with:       npm run dev:down
)
echo.
pause
