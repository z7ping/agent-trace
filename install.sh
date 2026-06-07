#!/bin/bash
# Claude Code Tooltrace 一键安装脚本
# 用法: curl -fsSL https://raw.githubusercontent.com/你的用户名/tooltrace/main/install.sh | bash
# 或者: bash install.sh

set -e

TOOLTRACE_DIR="$HOME/.claude/ai-tool-tracker"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo "🧠 AI Tool Tracker - 安装程序"
echo "============================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js"
    echo "请先安装 Node.js: https://nodejs.org/"
    echo ""
    echo "或者使用 Python 版本（需要 Python 3.6+）："
    echo "  设置 hooks command 为: python $TOOLTRACE_DIR/hooks/prelog.py"
    exit 1
fi

NODE_CMD="node"
echo "✅ 找到 Node.js: $NODE_CMD"

# 创建目录
echo ""
echo "📁 创建目录: $TOOLTRACE_DIR"
mkdir -p "$TOOLTRACE_DIR/hooks"
mkdir -p "$TOOLTRACE_DIR/logs"
mkdir -p "$TOOLTRACE_DIR/states"

# 复制文件（如果是从 git 仓库运行）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/hooks/prelog.js" ]; then
    echo "📋 复制文件..."
    cp "$SCRIPT_DIR/hooks/prelog.js" "$TOOLTRACE_DIR/hooks/"
    cp "$SCRIPT_DIR/hooks/prelog.py" "$TOOLTRACE_DIR/hooks/"
    cp "$SCRIPT_DIR/hooks/log.js" "$TOOLTRACE_DIR/hooks/"
    cp "$SCRIPT_DIR/hooks/log.py" "$TOOLTRACE_DIR/hooks/"
    cp "$SCRIPT_DIR/hooks/server-guard.js" "$TOOLTRACE_DIR/hooks/"
    cp "$SCRIPT_DIR/index.html" "$TOOLTRACE_DIR/"
    cp "$SCRIPT_DIR/server.js" "$TOOLTRACE_DIR/"
    cp "$SCRIPT_DIR/start.sh" "$TOOLTRACE_DIR/"
    cp "$SCRIPT_DIR/start.bat" "$TOOLTRACE_DIR/"
    cp "$SCRIPT_DIR/start.ps1" "$TOOLTRACE_DIR/"
    cp "$SCRIPT_DIR/start-server.cmd" "$TOOLTRACE_DIR/"
    cp "$SCRIPT_DIR/start-server.vbs" "$TOOLTRACE_DIR/"
    cp "$SCRIPT_DIR/README.md" "$TOOLTRACE_DIR/"
else
    echo "⚠️  警告: 未找到源文件，请确保在 ai-tool-tracker 目录运行此脚本"
fi

# 获取脚本的完整路径
PRELOG_PATH="$TOOLTRACE_DIR/hooks/prelog.js"
LOG_PATH="$TOOLTRACE_DIR/hooks/log.js"

# 转换路径（Windows Git Bash 需要）
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    PRELOG_PATH=$(cygpath -w "$PRELOG_PATH" | sed 's/\\/\\\\/g')
    LOG_PATH=$(cygpath -w "$LOG_PATH" | sed 's/\\/\\\\/g')
fi

# 更新 settings.json
echo ""
echo "⚙️  更新配置: $SETTINGS_FILE"

if [ -f "$SETTINGS_FILE" ]; then
    # 备份原配置
    cp "$SETTINGS_FILE" "$SETTINGS_FILE.bak"
    echo "   已备份原配置到 $SETTINGS_FILE.bak"

    # 检查是否已有 hooks 配置
    if grep -q '"hooks"' "$SETTINGS_FILE"; then
        echo "   ⚠️  检测到已存在 hooks 配置"
        echo "   请手动合并以下配置到 $SETTINGS_FILE:"
        echo ""
        cat << EOF
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "command": "$NODE_CMD $PRELOG_PATH",
            "type": "command",
            "timeout": 5,
            "statusMessage": "",
            "async": false
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "command": "$NODE_CMD $LOG_PATH",
            "type": "command",
            "timeout": 10,
            "statusMessage": "",
            "async": false
          }
        ]
      }
    ]
  }
}
EOF
    else
        # 使用 node 合并 JSON
        if command -v $NODE_CMD &> /dev/null; then
            $NODE_CMD -e "
const fs = require('fs');
const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf-8'));
settings.hooks = {
    PreToolUse: [{
        hooks: [{
            command: '$NODE_CMD $PRELOG_PATH',
            type: 'command',
            timeout: 5,
            statusMessage: '',
            async: false
        }]
    }],
    PostToolUse: [{
        hooks: [{
            command: '$NODE_CMD $LOG_PATH',
            type: 'command',
            timeout: 10,
            statusMessage: '',
            async: false
        }]
    }]
};
fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2));
console.log('   ✅ 配置已更新');
"
        else
            echo "   ❌ 无法自动合并配置，请手动添加 hooks 配置"
        fi
    fi
else
    # 创建新的 settings.json
    cat > "$SETTINGS_FILE" << EOF
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "command": "$NODE_CMD $PRELOG_PATH",
            "type": "command",
            "timeout": 5,
            "statusMessage": "",
            "async": false
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "command": "$NODE_CMD $LOG_PATH",
            "type": "command",
            "timeout": 10,
            "statusMessage": "",
            "async": false
          }
        ]
      }
    ]
  }
}
EOF
    echo "   ✅ 已创建配置文件"
fi

echo ""
echo "============================================"
echo "🎉 安装完成！"
echo ""

# 自动启动守护进程
echo "🚀 启动后台服务..."
if command -v $NODE_CMD &> /dev/null; then
    $NODE_CMD "$TOOLTRACE_DIR/server.js" 37215 --daemon 2>/dev/null || true
    sleep 1
    if $NODE_CMD "$TOOLTRACE_DIR/hooks/server-guard.js" --status 2>/dev/null | grep -q "运行中"; then
        echo "   ✅ 服务已在后台运行 → http://localhost:37215/"
    else
        echo "   ⚠️  服务未自动启动，请手动运行:"
        echo "      $NODE_CMD $TOOLTRACE_DIR/server.js 37215 --open"
    fi
else
    echo "   ⚠️  未找到 Node.js，请手动启动:"
    echo "      cd $TOOLTRACE_DIR && node server.js 37215"
fi

echo ""
echo "📝 使用说明："
echo "   • 服务会在后台自动运行，首次使用 Claude Code 工具时自动拉起"
echo "   • 打开浏览器查看: http://localhost:37215/"
echo "   • 管理命令:"
echo "     node server.js --stop    停止服务"
echo "     node server.js --status  查看状态"
echo ""
echo "📚 文档: $TOOLTRACE_DIR/README.md"
echo "============================================"
