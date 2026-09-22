@echo off
setlocal
set "ROOT=%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "%ROOT%sagittarius" %*
  exit /b %errorlevel%
)

where python >nul 2>nul
if %errorlevel%==0 (
  python "%ROOT%sagittarius" %*
  exit /b %errorlevel%
)

echo [Sagittarius] Python 3 was not found in PATH.
exit /b 1
