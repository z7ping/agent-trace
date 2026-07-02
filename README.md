# Agent Trace

—— 多 Agent 调用的全链路可观测性工具。统计 SKILL / Tool / MCP 调用次数，实时还原每一次会话的完整执行路径。

AgentTrace – End-to-end observability for multi‑agent invocations.
Aggregates call counts for SKILLs, Tools, and MCPs, and reconstructs the complete execution path of every session in real time.

## 特性

- **多 Agent 追踪** — 统计 SKILL / Tool / MCP 调用次数，还原完整调用链
- **调用链可视化** — 树形展示每次会话的 Agent→Tool 父子调用关系
- **分析仪表盘** — 总调用数、错误率、工具使用排行、慢调用
- **多数据源** — Hermes（SQLite 轮询）、Claude Code / Codex / Cursor（实时钩子）、OpenCode（SQLite 轮询）
- **实时刷新** — 3 秒增量更新，无需手动刷新
- **暗色主题** — 亮/暗一键切换

## 快速开始

```bash
# 克隆
git clone https://github.com/z7ping/agent-trace.git
cd agent-trace

# 安装依赖
npm install

# 开发模式（前后端联调）
npm run dev

# 生产构建
npm run build && npm start
```

访问 `http://localhost:56789/`

### 配置数据源

**Hermes（自动）**：服务启动后自动轮询 `~/.hermes/state.db`，无需额外配置。

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
npm start          # 启动服务
npm stop           # 停止
npm status         # 状态
npm run start      # 前台运行
npm run install-hooks  # 安装钩子到 Claude Code
```

## 目录结构

```
agent-trace/
├── server/                    # 后端
│   ├── server.js              # HTTP 服务
│   ├── cli.js                 # CLI 入口
│   ├── abeat-db.js            # SQLite 存储层
│   ├── config.js              # 服务配置
│   ├── adapters/              # 多工具适配器
│   │   ├── base.js            # 基类
│   │   ├── hermes.js          # Hermes 轮询适配器
│   │   ├── claude-code.js     # Claude Code 钩子适配器
│   │   ├── codex.js           # Codex 钩子适配器
│   │   ├── opencode.js        # OpenCode 轮询适配器
│   │   ├── cursor.js          # Cursor 钩子适配器
│   │   ├── pi.js              # Pi 适配器
│   │   └── index.js           # 适配器注册表
│   ├── hooks/                 # 实时钩子
│   │   ├── prelog.js          # PreToolUse
│   │   ├── log.js             # PostToolUse
│   │   └── server-guard.js    # 服务守护
│   └── scripts/               # 工具脚本
├── src/                       # 前端
│   ├── app.js                 # 主逻辑
│   ├── config.js              # 前端配置
│   ├── style.css              # 样式
│   ├── callchain/             # 调用链 Tab
│   └── dashboard/             # 仪表盘 Tab
├── index.html                 # 入口页面
├── package.json
└── README.md
```

## 数据统计

从 state.db 拉取，覆盖 109+ 会话，254 次 skill_view 调用，131 种工具：

```
次数最多的工具：terminal（14237）、read_file（1366）、patch（826）
MCP 调用排序：Vikunja（474）、Chrome DevTools（288）、Playwright（103）
加载最多的 Skill：z7ping-skill-management（23）、hermes-agent（21）、z7ping-vikunja（19）
```

## TODO

- [ ] 补充 CHANGELOG
- [ ] 推送到 GitHub Registry 或 npm

## 许可证

MIT License
