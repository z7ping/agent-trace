#!/bin/bash
# AI Tool Tracker install script
# Usage: bash install.sh

set -e

TOOLTRACE_DIR="$HOME/.claude/ai-tool-tracker"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo "AI Tool Tracker - Install"
echo "============================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js not found"
    echo "Please install Node.js: https://nodejs.org/"
    exit 1
fi

NODE_CMD="node"
echo "[OK] Node.js found"

# Create directories
echo ""
echo "Creating directories: $TOOLTRACE_DIR"
mkdir -p "$TOOLTRACE_DIR/hooks"
mkdir -p "$TOOLTRACE_DIR/logs"
mkdir -p "$TOOLTRACE_DIR/states"

# Copy files (skip if source == target)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$SCRIPT_DIR" = "$TOOLTRACE_DIR" ]; then
    echo "Source equals target, skipping copy"
else
    if [ -f "$SCRIPT_DIR/hooks/prelog.js" ]; then
        echo "Copying files..."
        cp "$SCRIPT_DIR/hooks/prelog.js" "$TOOLTRACE_DIR/hooks/"
        cp "$SCRIPT_DIR/hooks/prelog.py" "$TOOLTRACE_DIR/hooks/"
        cp "$SCRIPT_DIR/hooks/log.js" "$TOOLTRACE_DIR/hooks/"
        cp "$SCRIPT_DIR/hooks/log.py" "$TOOLTRACE_DIR/hooks/"
        cp "$SCRIPT_DIR/hooks/server-guard.js" "$TOOLTRACE_DIR/hooks/"
        cp "$SCRIPT_DIR/index.html" "$TOOLTRACE_DIR/"
        cp "$SCRIPT_DIR/server.js" "$TOOLTRACE_DIR/"
        cp "$SCRIPT_DIR/install-hooks.js" "$TOOLTRACE_DIR/"
        cp "$SCRIPT_DIR/start.sh" "$TOOLTRACE_DIR/"
        cp "$SCRIPT_DIR/start.bat" "$TOOLTRACE_DIR/"
        cp "$SCRIPT_DIR/start.ps1" "$TOOLTRACE_DIR/"
        cp "$SCRIPT_DIR/start-server.cmd" "$TOOLTRACE_DIR/"
        cp "$SCRIPT_DIR/start-server.vbs" "$TOOLTRACE_DIR/"
        cp "$SCRIPT_DIR/README.md" "$TOOLTRACE_DIR/"
    else
        echo "[WARN] Source files not found, skipping copy"
    fi
fi

# Update settings.json via JS helper
echo ""
echo "Updating settings: $SETTINGS_FILE"
$NODE_CMD "$TOOLTRACE_DIR/install-hooks.js"

echo ""
echo "============================================"
echo "Install complete!"
echo ""

# Auto-start daemon
echo "Starting background service..."
if command -v $NODE_CMD &> /dev/null; then
    $NODE_CMD "$TOOLTRACE_DIR/server.js" 37215 --daemon 2>/dev/null || true
    sleep 1
    if $NODE_CMD "$TOOLTRACE_DIR/hooks/server-guard.js" --status 2>/dev/null | grep -q "running"; then
        echo "   [OK] Service running -> http://localhost:37215/"
    else
        echo "   [WARN] Service not started, run manually:"
        echo "      $NODE_CMD $TOOLTRACE_DIR/server.js 37215 --open"
    fi
else
    echo "   [WARN] Node.js not found, run manually:"
    echo "      $NODE_CMD $TOOLTRACE_DIR/server.js 37215"
fi

echo ""
echo "Usage:"
echo "   Service auto-starts on first tool use"
echo "   Open browser: http://localhost:37215/"
echo "   Manage:"
echo "     node server.js --stop    Stop service"
echo "     node server.js --status  Check status"
echo ""
echo "Docs: $TOOLTRACE_DIR/README.md"
echo "============================================"
