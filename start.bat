@echo off
chcp 65001 >nul 2>nul

REM AI Tool Tracker - Server launcher (Windows)
REM Usage:
REM   start.bat              Start in foreground (shows logs)
REM   start.bat --daemon     Start in background (hidden, no window)
REM   start.bat --stop       Stop background service
REM   start.bat --status     Check service status

cd /d "%~dp0"

set "PORT=37215"
set "DAEMON=0"

:parse_args
if "%~1"=="" goto :done_args
if /I "%~1"=="--daemon" set "DAEMON=1"
if /I "%~1"=="-d" set "DAEMON=1"
if "%~1"=="--stop" (node server.js --stop & exit /b)
if "%~1"=="--status" (node server.js --status & exit /b)
if "%~1"=="--help" goto :show_help
if "%~1"=="-h" goto :show_help
set /a "PORT=%~1" 2>nul
if %PORT% equ 0 set "PORT=37215"
shift
goto :parse_args

:done_args

REM Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found
    echo Install Node.js: https://nodejs.org/
    pause
    exit /b 1
)

REM Daemon mode: use VBScript to launch hidden node process
if "%DAEMON%"=="1" (
    set "VBS_TEMP=%TEMP%\ai-tool-tracker-daemon.vbs"
    > "!VBS_TEMP!" (
        echo Set objShell = CreateObject^("WScript.Shell"^)
        echo objShell.CurrentDirectory = "%~dp0"
        echo objShell.Run "cmd.exe /c start /b node server.js %PORT% --daemon", 0, False
    )
    wscript "!VBS_TEMP!"
    del "!VBS_TEMP!" 2>nul
    exit /b 0
)

REM Foreground mode
echo.
echo AI Tool Tracker - HTTP Server
echo =============================
echo.
echo Port: %PORT%
echo URL:  http://localhost:%PORT%/
echo.
echo Ctrl+C to stop.
echo.

node server.js %PORT%
exit /b %errorlevel%

:show_help
echo AI Tool Tracker - Server launcher
echo.
echo Usage:
echo   start.bat              Start in foreground (shows logs)
echo   start.bat [port]       Start on custom port (default: 37215)
echo   start.bat --daemon     Start in background (hidden, no window)
echo   start.bat --stop       Stop background service
echo   start.bat --status     Check service status
echo   start.bat --help       Show this help
exit /b 0
