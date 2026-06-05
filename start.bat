@echo off
REM Claude Code Tooltrace - Start Script for Windows
REM Auto-detect environment and start HTTP server

echo.
echo Claude Code Tooltrace - HTTP Server
echo ====================================
echo.

set "SCRIPT_DIR=%~dp0"
set "PORT=8080"

REM Detect available HTTP servers (优先 Node.js server.js)
set "SERVER=none"

if exist "%SCRIPT_DIR%server.js" (
    where node >nul 2>nul
    if %errorlevel% equ 0 (
        set "SERVER=node-server"
        goto :found
    )
)

where npx >nul 2>nul
if %errorlevel% equ 0 (
    set "SERVER=npx"
    goto :found
)

where node >nul 2>nul
if %errorlevel% equ 0 (
    set "SERVER=node"
    goto :found
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    set "SERVER=python"
    goto :found
)

where php >nul 2>nul
if %errorlevel% equ 0 (
    set "SERVER=php"
    goto :found
)

where ruby >nul 2>nul
if %errorlevel% equ 0 (
    set "SERVER=ruby"
    goto :found
)

echo ERROR: No HTTP server found!
echo.
echo Please install one of the following:
echo   Python:  https://www.python.org/downloads/
echo   Node.js: https://nodejs.org/
echo   PHP:     https://www.php.net/
echo   Ruby:    https://www.ruby-lang.org/
echo.
pause
exit /b 1

:found
echo Using: %SERVER%
echo.

echo Starting server...
echo.

if "%SERVER%"=="python" (
    echo Server: Python HTTP Server
    echo Dir: %SCRIPT_DIR%
    echo URL: http://localhost:%PORT%/
    echo.
    echo Press Ctrl+C to stop
    echo ====================================
    echo.
    cd /d "%SCRIPT_DIR%"
    python -m http.server %PORT%
) else if "%SERVER%"=="node-server" (
    echo Server: Node.js Server (zero-dependency)
    echo Dir: %SCRIPT_DIR%
    echo URL: http://localhost:%PORT%/
    echo.
    echo Press Ctrl+C to stop
    echo ====================================
    echo.
    cd /d "%SCRIPT_DIR%"
    node server.js %PORT%
) else if "%SERVER%"=="npx" (
    echo Server: npx http-server
    echo Dir: %SCRIPT_DIR%
    echo URL: http://localhost:%PORT%/
    echo.
    echo Press Ctrl+C to stop
    echo ====================================
    echo.
    cd /d "%SCRIPT_DIR%"
    npx http-server -p %PORT% -c-1
) else if "%SERVER%"=="node" (
    echo Server: Node.js Server
    echo Dir: %SCRIPT_DIR%
    echo URL: http://localhost:%PORT%/
    echo.
    echo Press Ctrl+C to stop
    echo ====================================
    echo.
    cd /d "%SCRIPT_DIR%"
    node server.js %PORT%
) else if "%SERVER%"=="php" (
    echo Server: PHP Built-in Server
    echo Dir: %SCRIPT_DIR%
    echo URL: http://localhost:%PORT%/
    echo.
    echo Press Ctrl+C to stop
    echo ====================================
    echo.
    cd /d "%SCRIPT_DIR%"
    php -S localhost:%PORT%
) else if "%SERVER%"=="ruby" (
    echo Server: Ruby WEBrick
    echo Dir: %SCRIPT_DIR%
    echo URL: http://localhost:%PORT%/
    echo.
    echo Press Ctrl+C to stop
    echo ====================================
    echo.
    cd /d "%SCRIPT_DIR%"
    ruby -run -e httpd . -p %PORT%
)
