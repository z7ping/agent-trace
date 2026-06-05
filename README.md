# 🧠 Claude Code 工具调用链路追踪

实时记录并可视化 Claude Code 的每次工具调用（读文件、写文件、Bash 命令、MCP 工具等），按会话分组展示，方便调试和回溯。

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

**Linux / macOS:**
```bash
# 克隆仓库
git clone https://github.com/你的用户名/tooltrace.git
cd tooltrace

# 运行安装脚本
bash install.sh
```

**Windows:**
```bash
# 克隆仓库
git clone https://github.com/你的用户名/tooltrace.git
cd tooltrace

# 双击运行 install.bat 或在 CMD 中执行
install.bat
```

### 方式二：手动安装

```bash
# 1. 复制文件
cp -r .claude/tooltrace ~/.claude/

# 2. 配置 hooks（编辑 ~/.claude/settings.json）
# 添加以下内容到 settings.json：
```

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

## 📁 目录结构

```
~/.claude/tooltrace/
├── viewer.html          # 可视化页面（浏览器打开）
├── prelog.js            # PreToolUse hook（Node.js 版本，推荐）
├── log.js               # PostToolUse hook（Node.js 版本，推荐）
├── prelog.py            # PreToolUse hook（Python 版本，备选）
├── log.py               # PostToolUse hook（Python 版本，备选）
├── server.js            # Node.js 零依赖 HTTP 服务器（推荐）
├── start.sh             # 智能启动脚本（Linux/macOS）
├── start.bat            # 智能启动脚本（Windows CMD）
├── start.ps1            # 智能启动脚本（Windows PowerShell）
├── install.sh           # 一键安装脚本（Linux/macOS）
├── install.bat          # 一键安装脚本（Windows）
├── projects.json        # 项目列表（自动生成）
├── logs/                # 各项目的调用记录
│   ├── {project_key}.jsonl
│   └── ...
├── states/              # 各项目的调用栈状态
│   ├── {project_key}.json
│   └── ...
└── README.md            # 本文件
```

## 🔧 启动 HTTP 服务器

### 智能启动（推荐）

脚本会自动检测你的环境，选择可用的 HTTP 服务器。

**Linux / macOS:**
```bash
cd ~/.claude/tooltrace
bash start.sh
```

**Windows CMD:**
```cmd
cd C:\Users\你的用户名\.claude\tooltrace
start.bat
```

**Windows PowerShell:**
```powershell
cd C:\Users\你的用户名\.claude\tooltrace
.\start.ps1
```

### 手动启动

如果你知道自己的环境，可以直接使用对应命令：

```bash
# 方式 1: Node.js（零依赖，推荐）
cd ~/.claude/tooltrace
node server.js 8080

# 方式 2: Python
cd ~/.claude/tooltrace
python -m http.server 8080

# 方式 3: npx（需要 Node.js）
cd ~/.claude/tooltrace
npx http-server -p 8080

# 方式 4: PHP
cd ~/.claude/tooltrace
php -S localhost:8080

# 方式 5: Ruby
cd ~/.claude/tooltrace
ruby -run -e httpd . -p 8080
```

### 访问可视化页面

启动服务器后，打开浏览器访问：

**http://localhost:8080/viewer.html**

> 推荐使用 **Chrome** 或 **Edge** 浏览器。

## 🎯 使用步骤

1. **安装工具**：按照上述方式完成安装
2. **启动服务器**：运行智能启动脚本或手动启动
3. **打开浏览器**：访问 http://localhost:8080/viewer.html
4. **使用 Claude Code**：在任意项目中使用 Claude Code，工具调用会自动记录
5. **查看记录**：在网页中选择项目，查看工具调用详情

## 📋 功能说明

### 核心功能

| 功能 | 说明 |
|:---|:---|
| 📂 **会话分组** | 按 session_id 分组，显示统计摘要 |
| ⬇ **排序切换** | 点击「最新优先/最早优先」切换排序 |
| 🕐 **时间戳** | 每条调用显示绝对时间 + 相对时间 |
| 🔍 **搜索** | 支持搜索工具名、会话ID、文件路径、命令等 |
| 🎨 **类型配色** | 读文件(蓝)、写文件(绿)、命令(黄)、MCP(紫)、Agent(橙) |
| 🌙 **暗色主题** | 点击右上角月亮图标切换 |
| ▶ **折叠会话** | 点击会话头展开/折叠 |
| 🔄 **自动刷新** | 开启后每 3 秒增量刷新数据 |
| 🗑 **清空记录** | 底部「清空记录」按钮 |
| 📁 **项目切换** | 顶部下拉框切换不同项目 |

### 调用链追踪

| 功能 | 说明 |
|:---|:---|
| 🌲 **树形结构** | Agent 调用的子工具（Read/Write/Bash 等）自动缩进展示 |
| ⏱ **调用耗时** | 每条调用显示耗时，颜色标识：🟢 < 500ms、🟡 < 3s、🔴 ≥ 3s |
| ⚡ **会话统计** | 每个会话头显示总耗时和平均耗时 |
| 🐢 **慢调用标记** | 头部统计栏显示 ≥ 3s 的慢调用数量 |

### 筛选增强

| 功能 | 说明 |
|:---|:---|
| ✅ **成功调用筛选** | 快速筛选所有成功的调用 |
| ❌ **失败调用筛选** | 快速筛选所有失败的调用 |
| 🎯 **类型 + 状态组合** | 可同时按工具类型和状态筛选 |

### 性能优化

| 功能 | 说明 |
|:---|:---|
| ⚡ **增量加载** | 自动刷新时只追加新条目，不重建已有 DOM |
| 🧠 **智能轮询** | 3 秒间隔 + 后台标签页跳过刷新 |
| ⌨️ **键盘快捷键** | `Ctrl+F` 搜索、`R` 刷新 |
| 🔍 **搜索防抖** | 输入搜索词后 200ms 防抖，避免频繁渲染 |

### 错误记录说明

当工具调用失败时，`log.py` 会自动从 `tool_response` 中提取：
- Bash 命令的 stderr 输出
- MCP 工具的 error 信息
- 其他工具的通用错误字段

在 viewer 中，失败的调用会：
- 左侧显示红色边框
- 标题行显示 `✗` 标记
- 自动显示错误摘要（红色文本）
- 展开后可看到完整的错误详情

> ⚠️ **注意**：某些严重的工具调用失败可能不会触发 PostToolUse hook，这种情况下错误无法被记录。这是 Claude Code 的 hook 机制限制。

## ❓ 常见问题

### Q: 页面打开后没有数据显示？

**A:** 请检查以下几点：

1. 确认 HTTP 服务器正在运行（终端显示 "Starting server..." 或类似信息）
2. 确认浏览器访问的是 `http://localhost:8080/viewer.html`（不是 `file://` 协议）
3. 确认已经重启过 Claude Code（安装后需要重启才能生效）
4. 确认已经执行过一些 Claude Code 操作（需要先有工具调用才会产生数据）
5. 检查页面顶部的项目下拉框是否选择了正确的项目

### Q: 页面打开后一直转圈/加载失败？

**A:** 确认是用 HTTP 服务器打开的（`http://localhost:8080/viewer.html`），而不是直接双击 HTML 文件（`file://` 协议不支持 fetch）。

### Q: 中文显示为乱码？

**A:** 先确认浏览器编码为 UTF-8。如果日志中有旧数据乱码，可以清空重新开始：

```bash
echo "" > ~/.claude/tooltrace/logs/{project_key}.jsonl
```

### Q: 没有记录任何调用？

**A:** 请检查：

1. 检查 `~/.claude/settings.json` 中的 hook 配置是否正确（需要同时有 PreToolUse 和 PostToolUse）
2. 检查 `~/.claude/tooltrace/trace_error.log` 文件中是否有错误信息
3. 尝试将 hook 的 `async` 从 `false` 改为 `true`（性能优先）或保持 `false`（可靠性优先）

### Q: 需要安装 Python 吗？

**A:** 不需要！现在推荐使用 Node.js 版本的 hook 脚本（prelog.js 和 log.js），只需安装 Node.js 即可。如果你更喜欢 Python，也可以使用 Python 版本（prelog.py 和 log.py）。

### Q: states 目录是什么？

**A:** `states/` 目录下的文件是 `prelog.py` 和 `log.py` 之间共享的调用栈状态文件。

- `prelog.py`（工具开始执行前）：记录开始时间 + 入栈
- `log.py`（工具执行完成后）：计算耗时 + 出栈 + 记录调用链

如果文件损坏或丢失，`log.py` 会自动重建，但会导致这段时间内的调用丢失耗时和调用链信息。

### Q: 自动刷新导致页面闪烁？

**A:** 新版本采用增量加载模式，自动刷新时只追加新条目，不会重建已有 DOM，避免闪烁。

### Q: 如何切换不同项目的记录？

**A:** 使用页面顶部的项目下拉框选择要查看的项目。所有项目的数据都是自动记录和分离的。

## 🗑️ 卸载

删除整个目录并移除 hook 配置即可：

```bash
rm -rf ~/.claude/tooltrace/
# 同时删除 ~/.claude/settings.json 中的 hooks 配置
```

## 📝 更新日志

### v1.2.0 (2026-06-05)
- 新增 Node.js 版本的 hook 脚本 (prelog.js / log.js)
- 现在只需 Node.js 即可运行，无需 Python
- 更新所有安装脚本支持 Node.js
- 优化文档说明

### v1.1.0 (2026-06-05)
- 新增 Node.js 零依赖 HTTP 服务器 (server.js)
- 新增智能启动脚本 (start.sh / start.bat / start.ps1)
- 新增一键安装脚本 (install.sh / install.bat)
- 优化 Windows 兼容性
- 改进多项目支持

### v1.0.0 (2026-06-05)
- 初始版本发布
- 支持全局配置，所有项目自动生效
- 支持多项目日志分离
- 支持调用链追踪和耗时统计
- 支持自动刷新和增量加载

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 联系方式

如有问题，请通过 GitHub Issues 反馈。
