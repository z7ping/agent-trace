# 🧠 AI Tool Tracker

实时记录并可视化 Claude Code 的每次工具调用，按会话分组展示，方便调试和回溯。

> GitHub: https://github.com/你的用户名/ai-tool-tracker

## ✨ 特性

- **一键安装**：运行脚本即可完成配置
- **全局配置**：一次配置，所有项目自动生效
- **多项目支持**：按项目分组查看，支持项目切换
- **调用链追踪**：树形展示 Agent 调用的子工具
- **实时监控**：自动刷新，增量加载
- **多平台支持**：Windows、macOS、Linux 全平台兼容
- **零依赖**：只需 Node.js，无需安装其他包

## 🚀 快速安装

### 方式一：一键安装（推荐）

```bash
# 克隆仓库
git clone https://github.com/你的用户名/tooltrace.git
cd tooltrace

# Linux / macOS
bash install.sh

# Windows
install.bat
```

### 方式二：手动安装

```bash
# 1. 复制文件
cp -r .claude/tooltrace ~/.claude/

# 2. 编辑 ~/.claude/settings.json，添加 hooks 配置
```

**Node.js 版本（推荐）：**

```json
{
  "hooks": {
    "PreToolUse": [{
      "hooks": [{
        "command": "node ~/.claude/tooltrace/hooks/prelog.js",
        "type": "command",
        "timeout": 5,
        "async": false
      }]
    }],
    "PostToolUse": [{
      "hooks": [{
        "command": "node ~/.claude/tooltrace/hooks/log.js",
        "type": "command",
        "timeout": 10,
        "async": false
      }]
    }]
  }
}
```

**Python 版本（备选）：**

```json
{
  "hooks": {
    "PreToolUse": [{
      "hooks": [{
        "command": "python ~/.claude/tooltrace/hooks/prelog.py",
        "type": "command",
        "timeout": 5,
        "async": false
      }]
    }],
    "PostToolUse": [{
      "hooks": [{
        "command": "python ~/.claude/tooltrace/hooks/log.py",
        "type": "command",
        "timeout": 10,
        "async": false
      }]
    }]
  }
}
```

> **Windows 用户**：使用完整路径，如 `C:/Users/你的用户名/.claude/tooltrace/hooks/prelog.js`

## 📁 目录结构

```
~/.claude/tooltrace/
├── hooks/                # Hook 脚本
│   ├── prelog.js         # Node.js 版本（推荐）
│   ├── prelog.py         # Python 版本（备选）
│   ├── log.js            # Node.js 版本（推荐）
│   └── log.py            # Python 版本（备选）
├── index.html            # 可视化页面
├── server.js             # Node.js HTTP 服务器
├── start.sh              # 启动脚本（Linux/macOS）
├── start.bat             # 启动脚本（Windows CMD）
├── start.ps1             # 启动脚本（Windows PowerShell）
├── install.sh            # 安装脚本（Linux/macOS）
├── install.bat           # 安装脚本（Windows）
├── README.md
├── package.sh            # 打包脚本
├── logs/                 # 运行时生成
├── states/               # 运行时生成
└── projects.json         # 运行时生成
```

## 🔧 启动 HTTP 服务器

### 智能启动（推荐）

```bash
cd ~/.claude/tooltrace

# Linux / macOS
bash start.sh

# Windows CMD
start.bat

# Windows PowerShell
.\start.ps1
```

### 手动启动

```bash
# Node.js（推荐）
node server.js 8080

# Python
python -m http.server 8080
```

### 访问可视化页面

打开浏览器访问：**http://localhost:8080/**

## 🎯 使用步骤

1. **安装工具**：运行安装脚本或手动配置
2. **重启 Claude Code**：使 hooks 配置生效
3. **启动服务器**：运行智能启动脚本
4. **打开浏览器**：访问 http://localhost:8080/
5. **使用 Claude Code**：工具调用会自动记录

## 📋 功能说明

### 核心功能

| 功能 | 说明 |
|:---|:---|
| 📂 **会话分组** | 按 session_id 分组显示 |
| 🔄 **自动刷新** | 3 秒增量刷新 |
| 🔍 **搜索过滤** | 支持搜索工具名、文件路径等 |
| 🌙 **暗色主题** | 点击月亮图标切换 |
| 🌲 **调用链追踪** | 树形展示子工具调用 |
| ⏱ **耗时统计** | 显示每个调用的耗时 |
| 📁 **项目切换** | 顶部下拉框切换项目 |

### Phase 1 新增功能

| 功能 | 说明 |
|:---|:---|
| 📊 **状态栏** | 实时显示 Hook 状态、最近错误、慢调用数量 |
| 🐢 **慢调用高亮** | >1s 黄色警告，>3s 红色严重 |
| ❌ **错误详情** | 展开显示完整错误、错误分类、修复建议 |
| 🔍 **错误日志** | 一键查看 hook 执行错误日志 |

## ❓ 常见问题

### 没有记录任何调用？
1. 确认已重启 Claude Code
2. 检查 `~/.claude/settings.json` 中的 hooks 配置
3. 查看 `trace_error.log` 是否有错误

### 页面没有数据显示？
1. 确认 HTTP 服务器正在运行
2. 确认浏览器访问的是 `http://localhost:8080/`
3. 确认已执行过一些 Claude Code 操作

### 需要安装 Python 吗？
不需要！推荐使用 Node.js 版本，只需安装 Node.js 即可。

## 🗑️ 卸载

```bash
rm -rf ~/.claude/tooltrace/
# 然后从 ~/.claude/settings.json 中删除 hooks 配置
```

## 📝 更新日志

### v1.4.0 (2026-06-05)
- 新增状态栏（Hook 状态、错误、慢调用）
- 慢调用高亮（>1s 黄色，>3s 红色）
- 错误详情增强（分类、建议）
- 错误日志查看功能

### v1.3.0 (2026-06-05)
- 项目更名为 AI Tool Tracker
- 精简目录结构
- 精简文档

### v1.2.0 (2026-06-05)
- 新增 Node.js 版本 hook 脚本
- 优化目录结构
- 精简文档

### v1.1.0 (2026-06-05)
- 新增 Node.js HTTP 服务器
- 新增智能启动脚本
- 新增一键安装脚本

### v1.0.0 (2026-06-05)
- 初始版本发布

## 📄 许可证

MIT License
