#!/bin/bash
# Package ai-tool-tracker for distribution
# Usage: bash package.sh

set -e

VERSION="1.2.0"
PACKAGE_NAME="tooltrace-v${VERSION}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="${SCRIPT_DIR}/dist"

echo "Packaging AI Tool Tracker v${VERSION}"
echo "=========================================="
echo ""

# Create dist directory
mkdir -p "$DIST_DIR"

# Create temp directory
TEMP_DIR=$(mktemp -d)
TEMP_PACKAGE="$TEMP_DIR/$PACKAGE_NAME"
mkdir -p "$TEMP_PACKAGE/hooks"

# Copy files
echo "Copying files..."
cp "$SCRIPT_DIR/hooks/prelog.js" "$TEMP_PACKAGE/hooks/"
cp "$SCRIPT_DIR/hooks/prelog.py" "$TEMP_PACKAGE/hooks/"
cp "$SCRIPT_DIR/hooks/log.js" "$TEMP_PACKAGE/hooks/"
cp "$SCRIPT_DIR/hooks/log.py" "$TEMP_PACKAGE/hooks/"
cp "$SCRIPT_DIR/hooks/server-guard.js" "$TEMP_PACKAGE/hooks/"
cp "$SCRIPT_DIR/index.html" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/server.js" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/install-hooks.js" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/start.sh" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/start.bat" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/install.sh" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/install.bat" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/README.md" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/package.sh" "$TEMP_PACKAGE/"
cp "$SCRIPT_DIR/.gitignore" "$TEMP_PACKAGE/"

# Set execute permissions
chmod +x "$TEMP_PACKAGE/install.sh"
chmod +x "$TEMP_PACKAGE/start.sh"
chmod +x "$TEMP_PACKAGE/package.sh"

# Create archive
echo ""
echo "Creating archive..."
cd "$TEMP_DIR"
if command -v zip &> /dev/null; then
    zip -r "$DIST_DIR/$PACKAGE_NAME.zip" "$PACKAGE_NAME"
    echo "[OK] Created: $DIST_DIR/$PACKAGE_NAME.zip"
elif command -v tar &> /dev/null; then
    tar -czf "$DIST_DIR/$PACKAGE_NAME.tar.gz" "$PACKAGE_NAME"
    echo "[OK] Created: $DIST_DIR/$PACKAGE_NAME.tar.gz"
else
    echo "[WARN] zip/tar not found"
    echo "Manual: $TEMP_PACKAGE"
fi

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "=========================================="
echo "Package complete!"
echo ""
echo "Output: $DIST_DIR/"
echo ""
echo "Distribution:"
echo "   1. Upload to GitHub Releases"
echo "   2. Share the archive directly"
echo "   3. Users run install.sh or install.bat"
echo "=========================================="
