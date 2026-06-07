@echo off
cd /d "%~dp0"
set "PORT=%1"
if "%PORT%"=="" set "PORT=37215"

echo.
echo AI Tool Tracker - HTTP Server
echo ==============================
echo.

REM Detect: Node.js > Python
set "SERVER=none"

if exist "%~dp0server.js" (
    where node >nul 2>nul && set "SERVER=node" && goto :start
)
where python >nul 2>nul && set "SERVER=python" && goto :start

echo ERROR: No HTTP server found.
echo Install Node.js or Python.
pause
exit /b 1

:start
echo Server: %SERVER%
echo Port:   %PORT%
echo URL:    http://localhost:%PORT%/
echo.
echo Press Ctrl+C to stop.
echo.

if "%SERVER%"=="node" (
    node server.js %PORT%
) else (
    python -m http.server %PORT%
)
