@echo off
REM Claude Code Tooltrace 一键安装脚本 (Windows)
REM 用法: 双击运行或在 CMD 中执行 install.bat

setlocal enabledelayedexpansion

echo 🧠 AI Tool Tracker - 安装程序
echo ============================================
echo.

set "TOOLTRACE_DIR=%USERPROFILE%\.claude\ai-tool-tracker"
set "SETTINGS_FILE=%USERPROFILE%\.claude\settings.json"

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: 未找到 Node.js
    echo 请先安装 Node.js: https://nodejs.org/
    echo.
    echo 或者使用 Python 版本（需要 Python 3.6+）：
    echo   设置 hooks command 为: python ~/.claude/tooltrace/hooks/prelog.py
    pause
    exit /b 1
)

set "NODE_CMD=node"
echo ✅ 找到 Node.js: %NODE_CMD%

REM 创建目录
echo.
echo 📁 创建目录: %TOOLTRACE_DIR%
if not exist "%TOOLTRACE_DIR%" mkdir "%TOOLTRACE_DIR%"
if not exist "%TOOLTRACE_DIR%\hooks" mkdir "%TOOLTRACE_DIR%\hooks"
if not exist "%TOOLTRACE_DIR%\logs" mkdir "%TOOLTRACE_DIR%\logs"
if not exist "%TOOLTRACE_DIR%\states" mkdir "%TOOLTRACE_DIR%\states"

REM 复制文件
echo 📋 复制文件...
set "SCRIPT_DIR=%~dp0"

if exist "%SCRIPT_DIR%hooks\prelog.js" (
    copy "%SCRIPT_DIR%hooks\prelog.js" "%TOOLTRACE_DIR%\hooks\" >nul
    copy "%SCRIPT_DIR%hooks\prelog.py" "%TOOLTRACE_DIR%\hooks\" >nul
    copy "%SCRIPT_DIR%hooks\log.js" "%TOOLTRACE_DIR%\hooks\" >nul
    copy "%SCRIPT_DIR%hooks\log.py" "%TOOLTRACE_DIR%\hooks\" >nul
    copy "%SCRIPT_DIR%index.html" "%TOOLTRACE_DIR%\" >nul
    copy "%SCRIPT_DIR%server.js" "%TOOLTRACE_DIR%\" >nul
    copy "%SCRIPT_DIR%start.sh" "%TOOLTRACE_DIR%\" >nul
    copy "%SCRIPT_DIR%start.bat" "%TOOLTRACE_DIR%\" >nul
    copy "%SCRIPT_DIR%start.ps1" "%TOOLTRACE_DIR%\" >nul
    copy "%SCRIPT_DIR%README.md" "%TOOLTRACE_DIR%\" >nul
) else if exist "%SCRIPT_DIR%.claude\tooltrace\hooks\prelog.js" (
    copy "%SCRIPT_DIR%.claude\tooltrace\hooks\prelog.js" "%TOOLTRACE_DIR%\hooks\" >nul
    copy "%SCRIPT_DIR%.claude\tooltrace\hooks\prelog.py" "%TOOLTRACE_DIR%\hooks\" >nul
    copy "%SCRIPT_DIR%.claude\tooltrace\hooks\log.js" "%TOOLTRACE_DIR%\hooks\" >nul
    copy "%SCRIPT_DIR%.claude\tooltrace\hooks\log.py" "%TOOLTRACE_DIR%\hooks\" >nul
    copy "%SCRIPT_DIR%.claude\tooltrace\index.html" "%TOOLTRACE_DIR%\" >nul
    copy "%SCRIPT_DIR%.claude\tooltrace\server.js" "%TOOLTRACE_DIR%\" >nul
    copy "%SCRIPT_DIR%.claude\tooltrace\start.sh" "%TOOLTRACE_DIR%\" >nul
    copy "%SCRIPT_DIR%.claude\tooltrace\start.bat" "%TOOLTRACE_DIR%\" >nul
    copy "%SCRIPT_DIR%.claude\tooltrace\start.ps1" "%TOOLTRACE_DIR%\" >nul
    copy "%SCRIPT_DIR%.claude\tooltrace\README.md" "%TOOLTRACE_DIR%\" >nul
) else (
    echo ⚠️  警告: 未找到源文件
)

REM 获取路径（转义反斜杠）
set "PRELOG_PATH=%TOOLTRACE_DIR%\hooks\prelog.js"
set "LOG_PATH=%TOOLTRACE_DIR%\hooks\log.js"
set "PRELOG_PATH=!PRELOG_PATH:\=\\!"
set "LOG_PATH=!LOG_PATH:\=\\!"

REM 更新 settings.json
echo.
echo ⚙️  更新配置: %SETTINGS_FILE%

if exist "%SETTINGS_FILE%" (
    echo    ⚠️  检测到已存在配置文件
    echo    请手动合并以下配置到 %SETTINGS_FILE%:
    echo.
    echo    {
    echo      "hooks": {
    echo        "PreToolUse": [
    echo          {
    echo            "hooks": [
    echo              {
    echo                "command": "%NODE_CMD% !PRELOG_PATH!",
    echo                "type": "command",
    echo                "timeout": 5,
    echo                "statusMessage": "",
    echo                "async": false
    echo              }
    echo            ]
    echo          }
    echo        ],
    echo        "PostToolUse": [
    echo          {
    echo            "hooks": [
    echo              {
    echo                "command": "%NODE_CMD% !LOG_PATH!",
    echo                "type": "command",
    echo                "timeout": 10,
    echo                "statusMessage": "",
    echo                "async": false
    echo              }
    echo            ]
    echo          }
    echo        ]
    echo      }
    echo    }
) else (
    echo {"hooks":{"PreToolUse":[{"hooks":[{"command":"%NODE_CMD% !PRELOG_PATH!","type":"command","timeout":5,"statusMessage":"","async":false}]}],"PostToolUse":[{"hooks":[{"command":"%NODE_CMD% !LOG_PATH!","type":"command","timeout":10,"statusMessage":"","async":false}]}]}} > "%SETTINGS_FILE%"
    echo    ✅ 已创建配置文件
)

echo.
echo ============================================
echo 🎉 安装完成！
echo.
echo 📝 下一步：
echo    1. 重启 Claude Code（使配置生效）
echo    2. 启动 HTTP 服务器查看工具调用：
echo       cd %TOOLTRACE_DIR%
echo       %NODE_CMD% server.js 8080
echo    3. 打开浏览器访问: http://localhost:8080/
echo.
echo 📚 文档: %TOOLTRACE_DIR%\README.md
echo ============================================
echo.
pause
