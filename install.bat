@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion

echo AI Tool Tracker - Install
echo ============================================
echo.

set "TOOLTRACE_DIR=%USERPROFILE%\.claude\ai-tool-tracker"
set "SETTINGS_FILE=%USERPROFILE%\.claude\settings.json"

REM Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found
    echo Please install Node.js: https://nodejs.org/
    pause
    exit /b 1
)

set "NODE_CMD=node"
echo [OK] Node.js found

REM Create directories
echo.
echo Creating directories...
if not exist "%TOOLTRACE_DIR%" mkdir "%TOOLTRACE_DIR%"
if not exist "%TOOLTRACE_DIR%\hooks" mkdir "%TOOLTRACE_DIR%\hooks"
if not exist "%TOOLTRACE_DIR%\logs" mkdir "%TOOLTRACE_DIR%\logs"
if not exist "%TOOLTRACE_DIR%\states" mkdir "%TOOLTRACE_DIR%\states"

REM Copy files (skip if source == target)
echo Copying files...
set "SCRIPT_DIR=%~dp0"

if "%SCRIPT_DIR%"=="%TOOLTRACE_DIR%\" (
    echo    Source equals target, skipping copy
) else (
    if exist "%SCRIPT_DIR%hooks\prelog.js" (
        copy "%SCRIPT_DIR%hooks\prelog.js" "%TOOLTRACE_DIR%\hooks\" >nul
        copy "%SCRIPT_DIR%hooks\prelog.py" "%TOOLTRACE_DIR%\hooks\" >nul
        copy "%SCRIPT_DIR%hooks\log.js" "%TOOLTRACE_DIR%\hooks\" >nul
        copy "%SCRIPT_DIR%hooks\log.py" "%TOOLTRACE_DIR%\hooks\" >nul
        copy "%SCRIPT_DIR%hooks\server-guard.js" "%TOOLTRACE_DIR%\hooks\" >nul
        copy "%SCRIPT_DIR%index.html" "%TOOLTRACE_DIR%\" >nul
        copy "%SCRIPT_DIR%server.js" "%TOOLTRACE_DIR%\" >nul
        copy "%SCRIPT_DIR%install-hooks.js" "%TOOLTRACE_DIR%\" >nul
        copy "%SCRIPT_DIR%start.sh" "%TOOLTRACE_DIR%\" >nul
        copy "%SCRIPT_DIR%start.bat" "%TOOLTRACE_DIR%\" >nul
        copy "%SCRIPT_DIR%start.ps1" "%TOOLTRACE_DIR%\" >nul
        copy "%SCRIPT_DIR%start-server.cmd" "%TOOLTRACE_DIR%\" >nul
        copy "%SCRIPT_DIR%start-server.vbs" "%TOOLTRACE_DIR%\" >nul
        copy "%SCRIPT_DIR%README.md" "%TOOLTRACE_DIR%\" >nul
    ) else (
        echo    [WARN] Source files not found
    )
)

REM Update settings.json via JS helper
echo.
echo Updating settings: %SETTINGS_FILE%
%NODE_CMD% "%TOOLTRACE_DIR%\install-hooks.js"

if %errorlevel% neq 0 (
    echo    [ERROR] Failed to update settings.json
)

echo.
echo ============================================
echo Install complete!
echo.

REM Auto-start daemon
echo Starting background service...
%NODE_CMD% "%TOOLTRACE_DIR%\server.js" 37215 --daemon 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Usage:
echo    Service runs in background, auto-starts on first tool use
echo    Open browser: http://localhost:37215/
echo    Manage:
echo      node server.js --stop    Stop service
echo      node server.js --status  Check status
echo.
echo Docs: %TOOLTRACE_DIR%\README.md
echo ============================================
echo.
pause
