#!/bin/bash
# AI Tool Tracker - 启动脚本
# 自动检测 Node.js 或 Python，启动 HTTP 服务器

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=${1:-8080}

echo "🧠 AI Tool Tracker - HTTP 服务器"
echo "================================"
echo ""

# 检测可用的 HTTP 服务器
SERVER="none"

if [ -f "$SCRIPT_DIR/server.js" ] && command -v node &> /dev/null; then
    SERVER="node"
elif command -v python &> /dev/null; then
    SERVER="python"
elif command -v python3 &> /dev/null; then
    SERVER="python3"
fi

if [ "$SERVER" = "none" ]; then
    echo "❌ 未找到可用的 HTTP 服务器"
    echo ""
    echo "请安装 Node.js 或 Python"
    exit 1
fi

case $SERVER in
    node)    echo "✅ 服务器: Node.js" ;;
    python)  echo "✅ 服务器: Python" ;;
    python3) echo "✅ 服务器: Python3" ;;
esac

echo "📂 目录: $SCRIPT_DIR"
echo "🌐 地址: http://localhost:$PORT/"
echo ""
echo "💡 按 Ctrl+C 停止"
echo "================================"
echo ""

cd "$SCRIPT_DIR"

case $SERVER in
    node)    node server.js "$PORT" ;;
    python)  python -m http.server "$PORT" ;;
    python3) python3 -m http.server "$PORT" ;;
esac
