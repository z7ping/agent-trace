# Claude Code Tooltrace - Start Script for PowerShell
# Auto-detect environment and start HTTP server

param(
    [int]$Port = 8080
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "Claude Code Tooltrace - HTTP Server" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor DarkGray
Write-Host ""

# Detect available HTTP servers
$Server = "none"

if (Get-Command python -ErrorAction SilentlyContinue) {
    $Server = "python"
} elseif (Test-Path "$ScriptDir\server.js" -and (Get-Command node -ErrorAction SilentlyContinue)) {
    $Server = "node-server"
} elseif (Get-Command npx -ErrorAction SilentlyContinue) {
    $Server = "npx"
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
    $Server = "node"
} elseif (Get-Command php -ErrorAction SilentlyContinue) {
    $Server = "php"
} elseif (Get-Command ruby -ErrorAction SilentlyContinue) {
    $Server = "ruby"
}

# Show available servers
Write-Host "Available servers:" -ForegroundColor Yellow
if (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Host "  [+] Python HTTP Server" -ForegroundColor Green
}
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "  [+] Node.js (server.js)" -ForegroundColor Green
}
if (Get-Command php -ErrorAction SilentlyContinue) {
    Write-Host "  [+] PHP Built-in Server" -ForegroundColor Green
}
if (Get-Command ruby -ErrorAction SilentlyContinue) {
    Write-Host "  [+] Ruby WEBrick" -ForegroundColor Green
}
Write-Host ""

# Start server
Write-Host "Starting server..." -ForegroundColor Cyan
Write-Host ""

if ($Server -eq "python") {
    Write-Host "Using: Python HTTP Server" -ForegroundColor Green
    Write-Host "Dir: $ScriptDir" -ForegroundColor DarkGray
    Write-Host "URL: http://localhost:$Port/viewer.html" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Press Ctrl+C to stop" -ForegroundColor DarkGray
    Write-Host "====================================" -ForegroundColor DarkGray
    Write-Host ""
    Set-Location $ScriptDir
    python -m http.server $Port
} elseif ($Server -eq "node-server") {
    Write-Host "Using: Node.js Server (zero-dependency)" -ForegroundColor Green
    Write-Host "Dir: $ScriptDir" -ForegroundColor DarkGray
    Write-Host "URL: http://localhost:$Port/viewer.html" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Press Ctrl+C to stop" -ForegroundColor DarkGray
    Write-Host "====================================" -ForegroundColor DarkGray
    Write-Host ""
    Set-Location $ScriptDir
    node server.js $Port
} elseif ($Server -eq "npx") {
    Write-Host "Using: npx http-server" -ForegroundColor Green
    Write-Host "Dir: $ScriptDir" -ForegroundColor DarkGray
    Write-Host "URL: http://localhost:$Port/viewer.html" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Press Ctrl+C to stop" -ForegroundColor DarkGray
    Write-Host "====================================" -ForegroundColor DarkGray
    Write-Host ""
    Set-Location $ScriptDir
    npx http-server -p $Port -c-1
} elseif ($Server -eq "node") {
    Write-Host "Using: Node.js Server" -ForegroundColor Green
    Write-Host "Dir: $ScriptDir" -ForegroundColor DarkGray
    Write-Host "URL: http://localhost:$Port/viewer.html" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Press Ctrl+C to stop" -ForegroundColor DarkGray
    Write-Host "====================================" -ForegroundColor DarkGray
    Write-Host ""
    Set-Location $ScriptDir
    node server.js $Port
} elseif ($Server -eq "php") {
    Write-Host "Using: PHP Built-in Server" -ForegroundColor Green
    Write-Host "Dir: $ScriptDir" -ForegroundColor DarkGray
    Write-Host "URL: http://localhost:$Port/viewer.html" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Press Ctrl+C to stop" -ForegroundColor DarkGray
    Write-Host "====================================" -ForegroundColor DarkGray
    Write-Host ""
    Set-Location $ScriptDir
    php -S localhost:$Port
} elseif ($Server -eq "ruby") {
    Write-Host "Using: Ruby WEBrick" -ForegroundColor Green
    Write-Host "Dir: $ScriptDir" -ForegroundColor DarkGray
    Write-Host "URL: http://localhost:$Port/viewer.html" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Press Ctrl+C to stop" -ForegroundColor DarkGray
    Write-Host "====================================" -ForegroundColor DarkGray
    Write-Host ""
    Set-Location $ScriptDir
    ruby -run -e httpd . -p $Port
} else {
    Write-Host "ERROR: No HTTP server found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install one of the following:" -ForegroundColor Yellow
    Write-Host "  Python:  https://www.python.org/downloads/" -ForegroundColor White
    Write-Host "  Node.js: https://nodejs.org/" -ForegroundColor White
    Write-Host "  PHP:     https://www.php.net/" -ForegroundColor White
    Write-Host "  Ruby:    https://www.ruby-lang.org/" -ForegroundColor White
    Write-Host ""
    Write-Host "Or use VS Code Live Server extension" -ForegroundColor White
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}
