# 🧠 Agent Beat

实时记录并可视化 Claude Code 的每次工具调用，按会话分组展示，方便调试和回溯。

> GitHub: https://github.com/你的用户名/agent-beat

## ✨ 特性

- **一键安装**：运行脚本即可完成配置
- **零操作启动**：安装后自动在后台运行，首次使用 Claude Code 工具时自动拉起服务
- **全局配置**：一次配置，所有项目自动生效
- **多项目支持**：按项目分组查看，支持项目切换
- **调用链追踪**：树形展示 Agent 调用的子工具
- **实时监控**：自动刷新，增量加载
- **多平台支持**：Windows、macOS、Linux 全平台兼容
- **依赖简单**：只需 Node.js + better-sqlite3（`npm install` 自动安装）

## 🚀 快速安装

### 前置：国内网络加速（可选）

如果 `npm install` 安装 `better-sqlite3` 超时或失败，配置国内镜像：

```bash
# 换淘宝 npm 源
npm config set registry https://registry.npmmirror.com

# 设置 better-sqlite3 预编译二进制镜像
npm config set better_sqlite3_binary_host_mirror https://npmmirror.com/mirrors/better-sqlite3
```

> Windows 用户如果编译失败，还需安装构建工具：`npm install -g windows-build-tools`

### 方式一：CLI 安装（推荐）

```bash
# 克隆仓库
git clone https://github.com/你的用户名/agent-beat.git
cd agent-beat

# 一键安装（所有平台）
npx agent-beat install
```

### 方式二：npm 脚本安装

```bash
npm run install-hooks
```

### 方式三：全局安装（推送到npm后可用）

```bash
# 全局安装后可直接使用 agent-beat 命令
npm install -g agent-beat
agent-beat install
```

**Node.js 版本（推荐）：**

```json
{
  "hooks": {
    "PreToolUse": [{
      "hooks": [{
        "command": "node ~/.claude/agent-beat/hooks/prelog.js",
        "type": "command",
        "timeout": 5,
        "async": false
      }]
    }],
    "PostToolUse": [{
      "hooks": [{
        "command": "node ~/.claude/agent-beat/hooks/log.js",
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
        "command": "python ~/.claude/agent-beat/hooks/prelog.py",
        "type": "command",
        "timeout": 5,
        "async": false
      }]
    }],
    "PostToolUse": [{
      "hooks": [{
        "command": "python ~/.claude/agent-beat/hooks/log.py",
        "type": "command",
        "timeout": 10,
        "async": false
      }]
    }]
  }
}
```

> **Windows 用户**：使用完整路径，如 `C:/Users/你的用户名/.claude/agent-beat/hooks/prelog.js`

## 📁 目录结构

```
~/.claude/agent-beat/
├── hooks/                # Hook 脚本
│   ├── prelog.js         # Node.js 版本（推荐）
│   ├── prelog.py         # Python 版本（备选）
│   ├── log.js            # Node.js 版本（推荐）
│   ├── log.py            # Python 版本（备选）
│   └── server-guard.js   # 服务守护模块
├── install-hooks.js       # settings.json 配置写入工具
├── cli.js                # 统一 CLI 入口（跨平台）
├── index.html            # 可视化页面
├── server.js             # Node.js HTTP 服务器（支持守护进程模式）
├── README.md
├── logs/                 # 运行时生成
├── states/               # 运行时生成
├── .server.pid           # 运行时生成（守护进程 PID）
└── projects.json         # 运行时生成
```

## 🔧 启动 HTTP 服务器

### 安装后自动运行（推荐）

运行 `install.sh` 或 `install.bat` 后，服务会在后台自动启动（端口 **37215**）。首次使用 Claude Code 工具时，钩子会自动检测并拉起服务。

### 手动管理

```bash
# 使用 CLI（推荐）
agent-beat start             # 前台运行
agent-beat start --daemon    # 后台守护进程
agent-beat stop              # 停止服务
agent-beat status            # 查看状态

# 或直接使用 server.js（向后兼容）
node server.js 37215
node server.js --status
node server.js --stop
```

### 访问可视化页面

- **主页面**：http://localhost:37215/
- **分析仪表盘**：http://localhost:37215/dashboard.html

## 🎯 使用步骤

1. **安装工具**：运行安装脚本或手动配置，服务自动在后台启动
2. **重启 Claude Code**：使 hooks 配置生效
3. **使用 Claude Code**：工具调用会自动记录，服务自动拉起
4. **打开浏览器**：访问 http://localhost:37215/

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

### Phase 2 新增功能

| 功能 | 说明 |
|:---|:---|
| 📊 **分析仪表盘** | 使用分析、性能分析、错误分析 |
| 🔧 **工具使用 TOP 10** | 按频率排序，带进度条 |
| 🕐 **时间分布热力图** | 24 小时使用分布 |
| 🐌 **慢调用排行** | TOP 10 最慢的调用 |
| 💡 **效率洞察** | 智能分析工作流和优化建议 |

### Phase 3 新增功能

| 功能 | 说明 |
|:---|:---|
| 📥 **数据导出** | 支持导出为 JSON/CSV/Markdown |
| 📋 **导出报告** | 生成完整的分析报告 |

## ❓ 常见问题

### 没有记录任何调用？
1. 确认已重启 Claude Code
2. 检查 `~/.claude/settings.json` 中的 hooks 配置
3. 查看 `trace_error.log` 是否有错误

### 页面没有数据显示？
1. 确认 HTTP 服务器正在运行
2. 确认浏览器访问的是 `http://localhost:37215/`
3. 确认已执行过一些 Claude Code 操作

### 需要安装 Python 吗？
不需要！推荐使用 Node.js 版本，只需安装 Node.js 即可。

## 🗑️ 卸载

```bash
agent-beat uninstall
```

会自动停止服务、删除配置和数据、卸载全局命令。

## 📝 更新日志

### v1.8.1 (2026-06-09)
- 新增统一 CLI 入口 `cli.js`，替代 5 个 shell/bat 脚本
- 新增 `bin` 入口: `agent-beat` 命令
- 新增 npm scripts: `install-hooks`, `start`, `stop`, `status`, `package`
- 删除 `install.sh`, `install.bat`, `start.sh`, `start.bat`, `package.sh`
- 更新 `server-guard.js` 使用 `cli.js` 统一启动服务
- 保持向后兼容: `node server.js` 命令仍然可用

### v1.8.0 (2026-06-08)
- 精简脚本：删除 start-server.cmd、start-server.vbs、start.ps1
- start.bat 支持 --daemon/--stop/--status 参数
- 修复 install.bat 编码问题（chcp 65001）和自复制失败
- install 脚本自动初始化空 projects.json
- server-guard.js 改用 start.bat --daemon 启动服务

### v1.7.0 (2026-06-05)
- 新增服务守护：钩子自动拉起 HTTP 服务器，安装后零操作
- 新增守护进程模式（`--daemon` / `--stop` / `--status`）
- 新增 Windows 后台启动器（`start-server.cmd`）
- 新增 `hooks/server-guard.js` 共享守护模块
- 默认端口从 8080 改为 37215（避免端口冲突）
- 安装脚本自动启动后台服务

### v1.6.0 (2026-06-05)
- 新增数据导出功能（JSON/CSV/Markdown）
- 导出完整分析报告
- 优化错误日志显示

### v1.5.0 (2026-06-05)
- 新增分析仪表盘（使用分析、性能分析、错误分析）
- 工具使用频率 TOP 10
- 时间分布热力图
- 慢调用排行
- 错误类型分布
- 会话统计
- 效率洞察建议

### v1.4.0 (2026-06-05)
- 新增状态栏（Hook 状态、错误、慢调用）
- 慢调用高亮（>1s 黄色，>3s 红色）
- 错误详情增强（分类、建议）
- 错误日志查看功能

### v1.3.0 (2026-06-05)
- 项目更名为 Agent Beat
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

---

## TODO

- [ ] 推送到npm registry，支持 `npm install -g agent-beat`
- [ ] 添加CHANGELOG
- [ ] 添加LICENSE
- [ ] 完善Cursor适配器
- [ ] 实现OpenClaw适配器
