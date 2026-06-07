@echo off
REM AI Tool Tracker - 后台启动器 (Windows)
REM 用法: start-server.cmd [port]
REM 创建完全独立的后台进程

set PORT=%1
if "%PORT%"=="" set PORT=37215

cd /d "%~dp0"
start "" /B node server.js %PORT% --daemon
