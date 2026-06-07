# AI Tool Tracker - PowerShell 启动脚本
# 自动检测 Node.js 或 Python，启动 HTTP 服务器

param(
    [int]$Port = 37215
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "AI Tool Tracker - HTTP Server" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor DarkGray
Write-Host ""

# 检测: Node.js > Python
$Server = "none"

if (Test-Path "$ScriptDir\server.js") {
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $Server = "node"
    }
}
if ($Server -eq "none" -and (Get-Command python -ErrorAction SilentlyContinue)) {
    $Server = "python"
}

if ($Server -eq "none") {
    Write-Host "ERROR: No HTTP server found." -ForegroundColor Red
    Write-Host "Install Node.js or Python." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Server: $Server" -ForegroundColor Green
Write-Host "Dir:    $ScriptDir" -ForegroundColor DarkGray
Write-Host "URL:    http://localhost:$Port/" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor DarkGray
Write-Host "==============================" -ForegroundColor DarkGray
Write-Host ""

Set-Location $ScriptDir

if ($Server -eq "node") {
    node server.js $Port
} else {
    python -m http.server $Port
}
