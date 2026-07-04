# Agent Trace

—— 多 Agent 调用的全链路可观测性工具。统计 SKILL / Tool / MCP 调用次数，实时还原每一次会话的完整执行路径。

AgentTrace – End-to-end observability for multi‑agent invocations.
Aggregates call counts for SKILLs, Tools, and MCPs, and reconstructs the complete execution path of every session in real time.

## 特性

- **多 Agent 追踪** — 统计 SKILL / Tool / MCP 调用次数，还原完整调用链
- **调用链可视化** — 树形展示每次会话的 Agent→Tool 父子调用关系
- **分析仪表盘** — 总调用数、错误率、工具使用排行、慢调用
- **多数据源** — Hermes（SQLite 轮询）、Claude Code / Codex / Cursor / Pi（实时钩子）、OpenCode（SQLite 轮询）
- **Timeline 可观测** — 统一 timeline 表，支持跨数据源对比、role 语义分类、错误自动归类
- **实时刷新** — 3 秒增量更新，无需手动刷新
- **暗色主题** — 亮/暗一键切换

## 快速开始

```bash
# 克隆
git clone https://github.com/z7ping/agent-trace.git
cd agent-trace

# 安装依赖
npm install

# 开发模式
npm run dev           # 仅前端 vite dev server（端口 5173）
node server/cli.js start   # 启动后端服务（端口 56789）

# 生产构建
npm run build && npm start
```

访问 `http://localhost:56789/`

### 配置数据源

**Hermes（自动）**：服务启动后自动轮询 `~/.hermes/data/state.db`，无需额外配置。支持 state 持久化，重启不重复导入。

**Claude Code**：在 `~/.claude/settings.json` 中添加：

```json
{
  "hooks": {
    "PreToolUse": [{
      "hooks": [{
        "command": "node /path/to/agent-trace/server/hooks/prelog.js",
        "type": "command",
        "timeout": 5
      }]
    }],
    "PostToolUse": [{
      "hooks": [{
        "command": "node /path/to/agent-trace/server/hooks/log.js",
        "type": "command",
        "timeout": 10
      }]
    }]
  }
}
```

**Codex**：在 `~/.codex/hooks.json` 中添加相同配置。

## CLI

```bash
npx agent-trace install            # 安装 hooks + 注册 systemd 服务（自动启动+开机自启）
npx agent-trace service start      # 启动服务
npx agent-trace service stop       # 停止服务
npx agent-trace service enable     # 启用开机自启
npx agent-trace service disable    # 关闭开机自启
npx agent-trace service status     # 查看服务状态
npx agent-trace service uninstall  # 移除 systemd 服务
npx agent-trace package            # 打包分发

# 向后兼容
node server/cli.js start
node server/cli.js stop
node server/cli.js status
```

### 服务管理

安装后自动注册为**系统服务**，支持开机自启。自动检测平台：

| 平台 | 服务机制 | 配置路径 |
|------|---------|---------|
| Linux | systemd user service | `~/.config/systemd/user/agent-trace.service` |
| macOS | launchd agent | `~/Library/LaunchAgents/com.agent-trace.plist` |
| Windows | 任务计划程序 | `schtasks /tn "AgentTrace"` |

```bash
# 查看状态
npx agent-trace service status

# 停止/启动服务
npx agent-trace service stop
npx agent-trace service start

# 关闭/开启开机自启
npx agent-trace service disable
npx agent-trace service enable

# 完全卸载系统服务
npx agent-trace service uninstall
```

> **Linux 注意**：需要 `sudo loginctl enable-linger <user>` 才能在未登录时保持服务运行。安装时会自动检测并提示。
>
> **Windows 注意**：任务计划程序需要管理员权限注册，安装时若失败会提示手动运行。

## 目录结构

```
agent-trace/
├── server/                    # 后端
│   ├── server.js              # HTTP 服务
│   ├── cli.js                 # CLI 入口
│   ├── routes.js              # API 路由
│   ├── abeat-db.js            # SQLite 存储层
│   ├── db.js                  # 数据库连接管理
│   ├── config.js              # 服务配置
│   ├── schema.sql             # 表结构定义
│   ├── adapters/              # 多工具适配器
│   │   ├── base.js            # 基类
│   │   ├── hermes.js          # Hermes 轮询适配器
│   │   ├── claude-code.js     # Claude Code 钩子适配器
│   │   ├── codex.js           # Codex 钩子适配器
│   │   ├── opencode.js        # OpenCode 轮询适配器
│   │   ├── cursor.js          # Cursor 钩子适配器
│   │   ├── pi.js              # Pi 适配器
│   │   ├── openclaw.js        # OpenClaw 骨架
│   │   └── index.js           # 适配器注册表
│   ├── hooks/                 # 实时钩子
│   │   ├── prelog.js          # PreToolUse
│   │   ├── log.js             # PostToolUse
│   │   └── server-guard.js    # 服务守护
│   └── scripts/               # 工具脚本
│       ├── migrate-jsonl.js   # JSONL 数据迁移
│       └── verify-integrity.js # 数据完整性校验
├── src/                       # 前端
│   ├── app.js                 # 主逻辑
│   ├── config.js              # 前端配置
│   ├── style.css              # 样式
│   ├── utils.js               # 工具函数
│   ├── components/            # 公共组件
│   ├── callchain/             # 调用链 Tab
│   └── dashboard/             # 仪表盘 Tab
├── index.html                 # 入口页面
├── package.json
└── README.md
```

## Timeline 表

核心数据模型，存储所有数据源的结构化事件：

| 字段 | 说明 |
|------|------|
| source | 数据来源：`hermes` / `claude-code` |
| session_id | 会话标识 |
| timestamp | 事件时间戳 |
| role | 事件角色：`user` / `assistant` / `tool_result` / `tool_error` |
| tool_name | 工具名称 |
| error_type | 错误分类：`windows_command` / `path_not_found` / `permission` / `timeout` / `syntax` / `unknown` |
| error_detail | 错误详情 JSON |

## TODO

- [ ] 补充 CHANGELOG
- [ ] 发布到 npm

## 许可证

MIT License
