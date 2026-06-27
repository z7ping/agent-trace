# 🧠 Agent Beat

实时记录并可视化 AI 编码工具的每次工具调用，按会话分组展示，方便调试和回溯。

支持工具：Claude Code、Hermes、Codex、OpenCode、Cursor

> Gitea: http://192.168.31.239:53000/ai-area/agent-beat

## ✨ 特性

- **多工具支持**：已适配 5 种 AI 编码工具（Claude Code、Hermes、Codex、OpenCode、Cursor）
- **一键安装**：运行脚本即可完成配置
- **零操作启动**：安装后自动在后台运行，首次使用工具时自动拉起服务
- **调用链追踪**：树形展示 Agent 调用的子工具
- **实时监控**：自动刷新，增量加载
- **分析仪表盘**：使用统计、性能分析、错误分析
- **工具筛选**：按工具类型筛选数据
- **依赖简单**：只需 Node.js + better-sqlite3

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

### 方式一：直接运行（推荐）

```bash
# 克隆仓库
git clone http://192.168.31.239:53000/ai-area/agent-beat.git
cd agent-beat

# 安装依赖
npm install

# 启动服务
node server.js
```

### 方式二：npm 脚本安装

```bash
npm install
npm run install-hooks
```

### 方式三：全局安装（推送到 npm 后可用）

```bash
# 全局安装后可直接使用 agent-beat 命令
npm install -g agent-beat
agent-beat install
```

## 📁 目录结构

```
agent-beat/
├── adapters/             # 多工具适配器
│   ├── base.js           # 适配器基类
│   ├── claude-code.js    # Claude Code 适配器
│   ├── hermes.js         # Hermes 适配器
│   ├── codex.js          # Codex 适配器
│   ├── opencode.js       # OpenCode 适配器
│   ├── cursor.js         # Cursor 适配器
│   ├── openclaw.js       # OpenClaw 适配器（骨架）
│   └── index.js          # 适配器注册表
├── hooks/                # Hook 脚本
│   ├── prelog.js         # PreToolUse 钩子
│   ├── log.js            # PostToolUse 钩子
│   ├── prelog.py         # Python 版本（备选）
│   ├── log.py            # Python 版本（备选）
│   └── server-guard.js   # 服务守护模块
├── docs/                 # 文档
│   └── adapter-architecture.md  # 架构设计文档
├── cli.js                # 统一 CLI 入口
├── install-hooks.js      # settings.json 配置写入工具
├── index.html            # 可视化页面（单页面 Tab 切换）
├── server.js             # HTTP 服务器
├── package.json
├── README.md
└── CLAUDE.md
```

## 🔧 启动 HTTP 服务器

### 安装后自动运行（推荐）

首次使用工具时，钩子会自动检测并拉起服务（端口 **37215**）。

### 手动管理

```bash
# 使用 CLI
node cli.js start             # 前台运行
node cli.js start --daemon    # 后台守护进程
node cli.js stop              # 停止服务
node cli.js status            # 查看状态

# 或直接使用 server.js
node server.js 37215
node server.js --status
node server.js --stop
```

### 访问可视化页面

- **主页**：http://localhost:37215/
- Tab 切换：调用链 / 仪表盘

## 🎯 使用步骤

1. **安装工具**：克隆仓库，运行 `npm install`
2. **启动服务**：运行 `node server.js`
3. **配置钩子**：在对应工具的配置文件中添加 hooks（见下方）
4. **使用工具**：工具调用会自动记录
5. **打开浏览器**：访问 http://localhost:37215/

## 📋 多工具适配器

### 支持的工具

| 工具 | 数据源 | 方式 | 状态 |
|------|--------|------|------|
| Claude Code | hooks stdin | 实时钩子 | ✅ |
| Hermes | ~/.hermes/state.db | 定时轮询 | ✅ |
| Codex | hooks stdin | 实时钩子 | ✅ |
| OpenCode | ~/.local/share/opencode/opencode.db | 定时轮询 | ✅ |
| Cursor | hooks stdin | 实时钩子 | ✅ |
| OpenClaw | 待确认 | 待实现 | ⏳ |

### Claude Code 钩子配置

在 `~/.claude/settings.json` 中添加：

```json
{
  "hooks": {
    "PreToolUse": [{
      "hooks": [{
        "command": "node ~/.claude/agent-beat/hooks/prelog.js",
        "type": "command",
        "timeout": 5
      }]
    }],
    "PostToolUse": [{
      "hooks": [{
        "command": "node ~/.claude/agent-beat/hooks/log.js",
        "type": "command",
        "timeout": 10
      }]
    }]
  }
}
```

### Cursor 钩子配置

在 `~/.cursor/hooks.json` 中添加：

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [{
      "command": "node /path/to/agent-beat/hooks/prelog.js"
    }],
    "postToolUse": [{
      "command": "node /path/to/agent-beat/hooks/log.js"
    }]
  }
}
```

### Hermes / OpenCode

无需配置钩子，定时轮询数据库（每 5 秒）。

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
| 🔧 **工具筛选** | 按工具类型筛选数据 |

### 分析仪表盘

| 功能 | 说明 |
|:---|:---|
| 📊 **使用统计** | 总调用次数、平均耗时 |
| 🔧 **工具使用 TOP 10** | 按频率排序 |
| 🕐 **时间分布热力图** | 24 小时使用分布 |
| 🐌 **慢调用排行** | TOP 10 最慢的调用 |
| 💡 **效率洞察** | 智能分析工作流 |
| 📥 **数据导出** | 支持导出为 JSON/CSV/Markdown |

## ❓ 常见问题

### 没有记录任何调用？

1. 确认已重启对应工具
2. 检查 hooks 配置是否正确
3. 查看服务是否运行：`curl http://localhost:37215/`

### 页面没有数据显示？

1. 确认 HTTP 服务器正在运行
2. 确认浏览器访问的是 `http://localhost:37215/`
3. 确认已执行过一些工具操作

### better-sqlite3 安装失败？

配置国内镜像（见上方"国内网络加速"），或使用方式一直接运行。

### 端口 37215 被占用？

```bash
# 指定其他端口
node server.js 38000
```

## 🗑️ 卸载

```bash
# 停止服务
pkill -f "node server.js"

# 删除项目目录
rm -rf ~/.claude/agent-beat
```

## 📝 版本历史

### v1.8.1 (2026-06-27)
- 新增多工具适配器架构
- 新增 Claude Code / Hermes / Codex / OpenCode / Cursor 适配器
- 项目更名为 Agent Beat
- 合并 index.html 和 dashboard.html 为单页面 Tab 切换
- 新增工具筛选器

### v1.8.0 (2026-06-26)
- 新增统一 CLI 入口 `cli.js`
- 精简脚本

### v1.7.0 (2026-06-05)
- 新增服务守护：钩子自动拉起 HTTP 服务器
- 新增守护进程模式
- 默认端口从 8080 改为 37215

### v1.6.0 (2026-06-05)
- 新增数据导出功能（JSON/CSV/Markdown）

### v1.5.0 (2026-06-05)
- 新增分析仪表盘

### v1.4.0 (2026-06-05)
- 新增状态栏、慢调用高亮、错误详情

## 📄 许可证

MIT License

---

## TODO

- [ ] 推送到 npm registry
- [ ] 添加 LICENSE 文件
- [ ] 实现 OpenClaw 适配器
- [ ] systemd 开机自启服务
