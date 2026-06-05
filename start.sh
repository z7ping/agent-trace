#!/bin/bash
# Claude Code Tooltrace 智能启动脚本
# 自动检测环境，选择可用的 HTTP 服务器

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=${1:-8080}

echo "🧠 Claude Code Tooltrace - HTTP 服务器"
echo "======================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检测可用的 HTTP 服务器
detect_server() {
    # 1. 检测 Node.js (优先使用 server.js)
    if [ -f "$SCRIPT_DIR/server.js" ] && command -v node &> /dev/null; then
        echo "node-server"
        return
    fi
    if command -v npx &> /dev/null; then
        echo "npx"
        return
    fi
    if command -v node &> /dev/null; then
        echo "node"
        return
    fi

    # 2. 检测 Python (备选)
    if command -v python &> /dev/null; then
        echo "python"
        return
    fi
    if command -v python3 &> /dev/null; then
        echo "python3"
        return
    fi

    # 3. 检测 PHP
    if command -v php &> /dev/null; then
        echo "php"
        return
    fi

    # 4. 检测 Ruby
    if command -v ruby &> /dev/null; then
        echo "ruby"
        return
    fi

    # 5. 检测 BusyBox (某些系统)
    if command -v busybox &> /dev/null; then
        echo "busybox"
        return
    fi

    # 没有找到
    echo "none"
}

# 获取服务器名称
get_server_name() {
    case $1 in
        python|python3) echo "Python HTTP Server" ;;
        node-server) echo "Node.js Zero-Dependency Server (推荐)" ;;
        npx) echo "npx http-server (Node.js)" ;;
        node) echo "Node.js HTTP Server" ;;
        php) echo "PHP Built-in Server" ;;
        ruby) echo "Ruby WEBrick" ;;
        busybox) echo "BusyBox HTTP Server" ;;
        none) echo "未找到" ;;
    esac
}

# 获取启动命令
get_start_command() {
    local server=$1
    local port=$2
    local dir=$3

    case $server in
        python)
            echo "python -m http.server $port"
            ;;
        python3)
            echo "python3 -m http.server $port"
            ;;
        node-server)
            echo "node $dir/server.js $port"
            ;;
        npx)
            echo "npx http-server $dir -p $port -c-1"
            ;;
        node)
            # 创建临时 Node.js 服务器脚本
            local temp_script="$dir/.server.js"
            cat > "$temp_script" << 'NODEEOF'
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.argv[2] || 8080;
const DIR = process.argv[3] || '.';

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    let filePath = path.join(DIR, req.url === '/' ? 'index.html' : req.url);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
            res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log('Press Ctrl+C to stop');
});
NODEEOF
            echo "node $temp_script $port $dir"
            ;;
        php)
            echo "php -S localhost:$port -t $dir"
            ;;
        ruby)
            echo "ruby -run -e httpd $dir -p $port"
            ;;
        busybox)
            echo "busybox httpd -f -p $port -h $dir"
            ;;
        none)
            echo ""
            ;;
    esac
}

# 主逻辑
SERVER=$(detect_server)
SERVER_NAME=$(get_server_name "$SERVER")

echo "🔍 检测 HTTP 服务器..."
echo ""

if [ "$SERVER" = "none" ]; then
    echo -e "${RED}❌ 未找到可用的 HTTP 服务器${NC}"
    echo ""
    echo "请安装以下任一工具："
    echo ""
    echo "  Python:    https://www.python.org/downloads/"
    echo "  Node.js:   https://nodejs.org/"
    echo "  PHP:       https://www.php.net/"
    echo ""
    echo "或者使用 VS Code 的 Live Server 扩展"
    exit 1
fi

echo -e "${GREEN}✅ 找到: $SERVER_NAME${NC}"
echo ""

# 显示所有可用的服务器
echo "📋 可用的 HTTP 服务器："
if command -v python &> /dev/null || command -v python3 &> /dev/null; then
    echo "   • Python HTTP Server"
fi
if command -v npx &> /dev/null || command -v node &> /dev/null; then
    echo "   • Node.js (npx http-server)"
fi
if command -v php &> /dev/null; then
    echo "   • PHP Built-in Server"
fi
if command -v ruby &> /dev/null; then
    echo "   • Ruby WEBrick"
fi
echo ""

# 启动服务器
START_CMD=$(get_start_command "$SERVER" "$PORT" "$SCRIPT_DIR")

echo "🚀 启动服务器..."
echo "   命令: $START_CMD"
echo ""
echo "📂 服务目录: $SCRIPT_DIR"
echo "🌐 访问地址: http://localhost:$PORT/"
echo ""
echo "💡 提示："
echo "   • 按 Ctrl+C 停止服务器"
echo "   • 在浏览器中打开上面的地址"
echo "   • 首次使用需要在 Claude Code 中执行一些操作才会产生数据"
echo ""
echo "======================================"
echo ""

# 启动服务器
cd "$SCRIPT_DIR"
eval "$START_CMD"
