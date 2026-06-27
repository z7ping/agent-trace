# Agent Beat 多工具调研报告

> 创建日期：2026-06-27
> 来源：ai-agent-qin项目调研 + 实际实现验证

---

## 1. 工具数据源调研

### 1.1 数据源对比

| 工具 | 数据源 | 数据格式 | 采集方式 | 文件位置 |
|------|--------|----------|----------|----------|
| **Claude Code** | hooks stdin JSON | PreToolUse/PostToolUse | 实时钩子 | `~/.claude/hooks/` |
| **Hermes** | state.db | SQLite messages表 | 定时轮询 | `~/.hermes/state.db` |
| **Codex** | hooks stdin JSON | PreToolUse/PostToolUse | 实时钩子 | `~/.codex/hooks.json` |
| **OpenCode** | opencode.db | SQLite part表 | 定时轮询 | `~/.local/share/opencode/opencode.db` |

### 1.2 数据库结构

#### Hermes state.db

```sql
-- messages表
CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,           -- user/assistant/tool
  content TEXT,
  tool_call_id TEXT,
  tool_calls TEXT,              -- JSON数组
  tool_name TEXT,
  timestamp REAL NOT NULL,
  token_count INTEGER,
  finish_reason TEXT
);
```

#### OpenCode opencode.db

```sql
-- part表
CREATE TABLE part (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL,
  data TEXT NOT NULL            -- JSON：type, tool, callID, state
);
```

---

## 2. Token消耗数据

| 工具 | 数据源 | 可采集的Token数据 | 精度 |
|------|--------|-------------------|------|
| **Claude Code** | sessions/*.jsonl | input/output/cache tokens | 精确 |
| **Hermes** | state.db messages表 | token_count字段 | 精确 |
| **Codex** | threads表 | tokens_used字段 | 总量 |
| **OpenCode** | message表 data字段 | tokens对象（total/input/output/reasoning/cache） | 精确 |

---

## 3. 竞品分析

### 3.1 dotai

**功能**：定义一次配置，生成多个工具的原生文件

**优点**：
- 支持 Claude Code、Cursor、Codex、GitHub Copilot
- 命令简单：`dotai init`、`dotai sync`

**缺点**：
- 只做单向同步（生成配置文件）
- 不支持双向同步
- 无使用统计功能
- 无 Token 统计功能

### 3.2 agentalign

**功能**：MCP配置双向同步 + 事务回滚

**优点**：
- 双向同步 + 事务回滚
- 支持 10 个工具
- 密钥分割、环境变量标准化

**缺点**：
- 只管 MCP 配置，不管 skill/rules
- 无使用统计功能
- 无 Token 统计功能
- Rust 开发，扩展成本高

### 3.3 mem-bridge

**功能**：扫描各工具对话历史，建立统一索引

**优点**：
- 统一搜索历史决策
- 跨工具知识共享

**缺点**：
- 只管记忆，不管配置
- 无使用统计功能
- 无 Token 统计功能

---

## 4. Agent Beat的定位

### 4.1 差异化优势

1. **统一追踪** — 一套代码适配所有工具
2. **实时监控** — 钩子+轮询双模式
3. **可视化** — 调用链+仪表盘
4. **可扩展** — 适配器模式，易于添加新工具

### 4.2 与竞品对比

| 能力 | Agent Beat | dotai | agentalign | mem-bridge |
|------|------------|-------|------------|------------|
| 配置统一 | ❌ | ✅ | ✅ | ❌ |
| 工具追踪 | ✅ | ❌ | ❌ | ❌ |
| 使用统计 | ✅ | ❌ | ❌ | ❌ |
| Token统计 | ✅ | ❌ | ❌ | ❌ |
| 可视化 | ✅ | ❌ | ❌ | ❌ |
| 多工具支持 | ✅ | ✅ | ✅ | ✅ |

### 4.3 未来方向

1. **配置统一** — 可考虑集成dotai的能力
2. **记忆聚合** — 可考虑集成mem-bridge的能力
3. **更多工具** — 扩展支持Cursor、Windsurf等

---

## 5. 技术决策记录

### 5.1 为什么选择SQLite作为数据源？

- 已有现成的SQLite数据（Hermes、OpenCode）
- 查询方便，不需要解析日志
- 实时性好，支持定时轮询

### 5.2 为什么选择定时轮询而不是文件监听？

- 实现简单，不需要额外依赖
- 5秒轮询足够实时
- 跨平台兼容性好

### 5.3 为什么选择适配器模式？

- 每个工具的钩子机制不同
- 统一接口，易于扩展
- 解耦合，便于维护

---

## 6. 参考资料

- ai-agent-qin项目调研文档：`/data/hermes-z7ping/0-projects/ai-agent-qin/docs/01-调研文档.md`
- Hermes state.db结构：`~/.hermes/state.db`
- OpenCode opencode.db结构：`~/.local/share/opencode/opencode.db`
- Claude Code hooks文档：`https://code.claude.com/docs/en/hooks`
