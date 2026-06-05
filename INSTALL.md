# 安装说明

## 一键安装（推荐）

### Linux / macOS

```bash
# 克隆仓库
git clone https://github.com/你的用户名/tooltrace.git
cd tooltrace

# 运行安装脚本
bash install.sh
```

### Windows

```bash
# 克隆仓库
git clone https://github.com/你的用户名/tooltrace.git
cd tooltrace

# 双击运行 install.bat 或在 CMD 中执行
install.bat
```

## 手动安装

### 步骤 1: 复制文件

```bash
# Linux / macOS
cp -r .claude/tooltrace ~/.claude/

# Windows (Git Bash)
cp -r .claude/tooltrace ~/.claude/

# Windows (CMD)
xcopy /E /I .claude\tooltrace %USERPROFILE%\.claude\tooltrace
```

### 步骤 2: 配置 hooks

编辑 `~/.claude/settings.json`，添加以下内容：

**Node.js 版本（推荐，只需 Node.js）：**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "command": "node ~/.claude/tooltrace/prelog.js",
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
            "command": "node ~/.claude/tooltrace/log.js",
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
```

**Python 版本（备选，需要 Python 3.6+）：**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "command": "python ~/.claude/tooltrace/prelog.py",
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
            "command": "python ~/.claude/tooltrace/log.py",
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
```

> **Windows 用户**：使用完整路径，如 `C:/Users/你的用户名/.claude/tooltrace/prelog.js`

### 步骤 3: 重启 Claude Code

关闭并重新打开 Claude Code，使配置生效。

## 使用方法

### 1. 启动 HTTP 服务器

**智能启动（推荐）：**

```bash
cd ~/.claude/tooltrace

# Linux / macOS
bash start.sh

# Windows (CMD)
start.bat

# Windows (PowerShell)
.\start.ps1
```

脚本会自动检测你的环境，选择可用的 HTTP 服务器（Python/Node.js/PHP/Ruby）。

**手动启动：**

```bash
# Python（最常见）
cd ~/.claude/tooltrace
python -m http.server 8080

# Node.js（零依赖，推荐）
cd ~/.claude/tooltrace
node server.js 8080

# npx（需要 Node.js）
cd ~/.claude/tooltrace
npx http-server -p 8080
```

### 2. 打开浏览器

访问：http://localhost:8080/viewer.html

### 3. 使用 Claude Code

在任意项目中启动 Claude Code，开始工作。每次工具调用都会自动记录。

## 功能特性

- 📁 **项目切换**：顶部下拉框切换不同项目
- 🔄 **自动刷新**：点击"自动"按钮开启实时监控
- 🔍 **搜索过滤**：支持搜索工具名、文件路径、命令等
- 🌙 **暗色主题**：点击右上角月亮图标切换
- 🌲 **调用链追踪**：树形展示 Agent 调用的子工具
- ⏱ **耗时统计**：显示每个调用的耗时和性能指标

## 常见问题

### Q: 页面打开后没有数据？

A: 确认：
1. HTTP 服务器正在运行
2. Claude Code 已重启
3. 已经执行过一些工具调用
4. 项目下拉框选择了正确的项目

### Q: 如何查看不同项目的调用记录？

A: 使用页面顶部的项目下拉框切换项目。

### Q: 如何清空记录？

A: 点击页面底部的"清空记录"按钮，或在终端执行：
```bash
echo "" > ~/.claude/tooltrace/logs/{project_key}.jsonl
```

### Q: 如何卸载？

A: 删除目录并移除 hooks 配置：
```bash
rm -rf ~/.claude/tooltrace/
# 然后从 ~/.claude/settings.json 中删除 hooks 配置
```

## 更多信息

请查看 [README.md](README.md)
