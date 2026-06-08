@echo off
REM AI Tool Tracker - background starter (Windows)
REM Usage: start-server.cmd [port]

set PORT=%1
if "%PORT%"=="" set PORT=37215

cd /d "%~dp0"
start "" /B node server.js %PORT% --daemon
