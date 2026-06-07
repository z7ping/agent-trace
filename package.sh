#!/bin/bash
# 打包 tooltrace 为可分发的压缩包
# 用法: bash package.sh

set -e

VERSION="1.2.0"
PACKAGE_NAME="tooltrace-v${VERSION}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="${SCRIPT_DIR}/dist"

echo "📦 打包 Claude Code Tooltrace v${VERSION}"
echo "=========================================="
echo ""

# 创建 dist 目录
mkdir -p "$DIST_DIR"

# 创建临时目录
TEMP_DIR=$(mktemp -d)
TEMP_PACKAGE="$TEMP_DIR/$PACKAGE_NAME"
mkdir -p "$TEMP_PACKAGE/hooks"

# 复制文件
echo "📋 复制文件..."
cp "$SCRIPT_DIR/hooks/prelog.js" "$TEMP_PACKAGE/hooks/"
cp "$SCRIPT_DIR/hooks/prelog.py" "$TEMP_PACKAGE/hooks/"
cp "$SCRIPT_DIR/hooks/log.js" "$TEMP_PACKAGE/hooks/"
cp "$SCRIPT_DIR/hooks/log.py" "$TEMP_PACKAGE/hooks/"
cp "$SCRIPT_DIR/hooks/server-guard.js" "$TEMP_PACKAGE/hooks/"
cp "$SCRIPT_DIR/index.html" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/server.js" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/start.sh" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/start.bat" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/start.ps1" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/start-server.cmd" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/install.sh" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/install.bat" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/README.md" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/package.sh" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/.gitignore" "$TEMP_PACKAGE/"

# 设置执行权限
chmod +x "$TEMP_PACKAGE/install.sh"
chmod +x "$TEMP_PACKAGE/start.sh"
chmod +x "$TEMP_PACKAGE/package.sh"

# 创建压缩包
echo ""
echo "📦 创建压缩包..."
cd "$TEMP_DIR"
if command -v zip &> /dev/null; then
    zip -r "$DIST_DIR/$PACKAGE_NAME.zip" "$PACKAGE_NAME"
    echo "✅ 已创建: $DIST_DIR/$PACKAGE_NAME.zip"
elif command -v tar &> /dev/null; then
    tar -czf "$DIST_DIR/$PACKAGE_NAME.tar.gz" "$PACKAGE_NAME"
    echo "✅ 已创建: $DIST_DIR/$PACKAGE_NAME.tar.gz"
else
    echo "⚠️  未找到 zip 或 tar 命令"
    echo "请手动压缩: $TEMP_PACKAGE"
fi

# 清理临时文件
rm -rf "$TEMP_DIR"

echo ""
echo "=========================================="
echo "🎉 打包完成！"
echo ""
echo "📁 分发文件位置: $DIST_DIR/"
echo ""
echo "📝 分发方式："
echo "   1. 上传到 GitHub Releases"
echo "   2. 直接分享压缩包"
echo "   3. 用户下载后运行 install.sh 或 install.bat"
echo "=========================================="
