#!/bin/bash
# Claude Code Tooltrace 一键安装脚本
# 用法: curl -fsSL https://raw.githubusercontent.com/你的用户名/tooltrace/main/install.sh | bash
# 或者: bash install.sh

set -e

TOOLTRACE_DIR="$HOME/.claude/tooltrace"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo "🧠 Claude Code 工具调用链路追踪 - 安装程序"
echo "============================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js"
    echo "请先安装 Node.js: https://nodejs.org/"
    echo ""
    echo "或者使用 Python 版本（需要 Python 3.6+）："
    echo "  设置 hooks command 为: python ~/.claude/tooltrace/hooks/prelog.py"
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
    cp "$SCRIPT_DIR/index.html" "$TOOLTRACE_DIR/"
    cp "$SCRIPT_DIR/server.js" "$TOOLTRACE_DIR/"
    cp "$SCRIPT_DIR/start.sh" "$TOOLTRACE_DIR/"
    cp "$SCRIPT_DIR/start.bat" "$TOOLTRACE_DIR/"
    cp "$SCRIPT_DIR/start.ps1" "$TOOLTRACE_DIR/"
    cp "$SCRIPT_DIR/README.md" "$TOOLTRACE_DIR/"
elif [ -f "$SCRIPT_DIR/.claude/tooltrace/hooks/prelog.js" ]; then
    # 从项目根目录运行
    echo "📋 复制文件..."
    cp "$SCRIPT_DIR/.claude/tooltrace/hooks/prelog.js" "$TOOLTRACE_DIR/hooks/"
    cp "$SCRIPT_DIR/.claude/tooltrace/hooks/prelog.py" "$TOOLTRACE_DIR/hooks/"
    cp "$SCRIPT_DIR/.claude/tooltrace/hooks/log.js" "$TOOLTRACE_DIR/hooks/"
    cp "$SCRIPT_DIR/.claude/tooltrace/hooks/log.py" "$TOOLTRACE_DIR/hooks/"
    cp "$SCRIPT_DIR/.claude/tooltrace/index.html" "$TOOLTRACE_DIR/"
    cp "$SCRIPT_DIR/.claude/tooltrace/server.js" "$TOOLTRACE_DIR/"
    cp "$SCRIPT_DIR/.claude/tooltrace/start.sh" "$TOOLTRACE_DIR/"
    cp "$SCRIPT_DIR/.claude/tooltrace/start.bat" "$TOOLTRACE_DIR/"
    cp "$SCRIPT_DIR/.claude/tooltrace/start.ps1" "$TOOLTRACE_DIR/"
    cp "$SCRIPT_DIR/.claude/tooltrace/README.md" "$TOOLTRACE_DIR/"
else
    echo "⚠️  警告: 未找到源文件，请确保在 tooltrace 目录或项目根目录运行此脚本"
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
echo "📝 下一步："
echo "   1. 重启 Claude Code（使配置生效）"
echo "   2. 启动 HTTP 服务器查看工具调用："
echo "      cd $TOOLTRACE_DIR"
echo "      $NODE_CMD server.js 8080"
echo "   3. 打开浏览器访问: http://localhost:8080/"
echo ""
echo "📚 文档: $TOOLTRACE_DIR/README.md"
echo "============================================"
