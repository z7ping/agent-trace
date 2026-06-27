# Agent Beat 多工具适配器架构设计

> 创建日期：2026-06-27
> 最后更新：2026-06-27
> 状态：已实现

---

## 1. 目标

将Agent Beat从仅支持Claude Code，扩展为支持多工具的统一追踪系统。

支持的工具：
- ✅ Claude Code（实时钩子）
- ✅ Hermes（定时轮询state.db）
- ✅ Codex（实时钩子）
- ✅ OpenCode（定时轮询opencode.db）
- ✅ Cursor（实时钩子）
- ⏳ OpenClaw（待实现）

---

## 2. 核心设计

### 2.1 适配器模式

```
┌─────────────────────────────────────────────────────────┐
│                    Unified Tracker                       │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Claude Code │  │   Hermes    │  │    Codex    │     │
│  │  Adapter    │  │  Adapter    │  │  Adapter    │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│         │                │                │              │
│         └────────────────┼────────────────┘              │
│                          │                               │
│                  ┌───────▼───────┐                       │
│                  │  Unified API  │                       │
│                  └───────┬───────┘                       │
│                          │                               │
│                  ┌───────▼───────┐                       │
│                  │    SQLite     │                       │
│                  └───────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

### 2.2 统一数据格式

所有适配器输出统一格式：

```json
{
  "id": "uuid",
  "tool": "claude-code|hermes|codex|opencode|cursor",
  "event": "pre|post",
  "timestamp": "ISO8601",
  "session_id": "string",
  "project_key": "string",
  "data": {
    "tool_name": "string",
    "input_summary": "string",
    "duration_ms": "number",
    "success": "boolean",
    "error": "string|null"
  }
}
```

### 2.3 适配器接口

```javascript
/**
 * 适配器基类
 */
class BaseAdapter {
  /**
   * 适配器名称
   */
  get name() {}

  /**
   * 初始化适配器
   */
  async init() {}

  /**
   * 开始追踪
   */
  async start() {}

  /**
   * 停止追踪
   */
  async stop() {}

  /**
   * 获取工具调用记录
   * @param {Object} filter - 过滤条件
   * @returns {Array} 统一格式的调用记录
   */
  async getRecords(filter) {}
}
```

---

## 3. 数据库Schema

### 3.1 工具调用表

```sql
CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,           -- claude-code, hermes, codex, etc.
  event TEXT NOT NULL,          -- pre, post
  timestamp DATETIME NOT NULL,
  session_id TEXT,
  project_key TEXT,
  tool_name TEXT,
  input_summary TEXT,
  duration_ms INTEGER,
  success BOOLEAN,
  error TEXT,
  metadata JSON,                -- 工具特定的额外数据
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tool_calls_tool ON tool_calls(tool);
CREATE INDEX idx_tool_calls_session ON tool_calls(session_id);
CREATE INDEX idx_tool_calls_project ON tool_calls(project_key);
CREATE INDEX idx_tool_calls_timestamp ON tool_calls(timestamp);
```

### 3.2 会话表

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  project_key TEXT,
  started_at DATETIME,
  ended_at DATETIME,
  total_calls INTEGER DEFAULT 0,
  success_calls INTEGER DEFAULT 0,
  failed_calls INTEGER DEFAULT 0,
  metadata JSON
);
```

### 3.3 工具配置表

```sql
CREATE TABLE tool_configs (
  tool TEXT PRIMARY KEY,
  enabled BOOLEAN DEFAULT TRUE,
  adapter_class TEXT,
  config JSON,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. 适配器实现

### 4.1 Claude Code适配器 ✅

**数据源**：hooks/log.js + hooks/prelog.js（stdin JSON）

**实现方式**：
- 复用现有hooks代码
- 输出统一格式到JSONL

**文件**：`adapters/claude-code.js`（348行）

### 4.2 Hermes适配器 ✅

**数据源**：`~/.hermes/state.db`（SQLite只读）

**实现方式**：
- 定时轮询：每5秒读取messages表
- 只处理role='tool'的记录
- 基于tool_call_id关联获取输入信息
- 处理后标记observed=1

**文件**：`adapters/hermes.js`（385行）

### 4.3 Codex适配器 ✅

**数据源**：hooks stdin JSON（~/.codex/hooks.json已配置）

**实现方式**：
- 与Claude Code类似的钩子机制
- 支持PreToolUse/PostToolUse事件
- 字段兼容：tool_name/name/tool三选一

**文件**：`adapters/codex.js`（277行）

### 4.4 OpenCode适配器 ✅

**数据源**：`~/.local/share/opencode/opencode.db`（SQLite只读）

**实现方式**：
- 定时轮询：每5秒读取part表
- 只处理type='tool'的记录
- 基于state.time.start/end计算耗时
- 基于state.status判断成功/失败

**文件**：`adapters/opencode.js`（331行）

### 4.5 文件结构

```
adapters/
├── base.js           # 基类（239行）
├── claude-code.js    # Claude Code适配器（348行）
├── hermes.js         # Hermes适配器（385行）
├── codex.js          # Codex适配器（277行）
├── opencode.js       # OpenCode适配器（331行）
└── index.js          # 注册表（77行）
```

---

## 5. API设计

### 5.1 获取调用记录

```
GET /api/records?tool=claude-code&session=xxx&limit=100
```

### 5.2 获取统计信息

```
GET /api/stats?tool=claude-code&range=today
```

### 5.3 获取工具列表

```
GET /api/tools
```

---

## 6. 前端适配

### 6.1 工具筛选器

在tab导航栏附近加工具筛选下拉框：
- 全部
- Claude Code
- Hermes
- Codex
- OpenCode
- Cursor

### 6.2 数据展示

- 调用链页面：按工具分组展示
- 仪表盘页面：按工具分类统计

---

## 7. 实现计划

| 阶段 | 任务 | 状态 |
|------|------|------|
| 1 | 设计适配器接口和数据格式 | ✅ 完成 |
| 2 | 实现适配器基类 | ✅ 完成 |
| 3 | 完善Claude Code适配器 | ✅ 完成 |
| 4 | 实现Hermes适配器 | ✅ 完成 |
| 5 | 实现Codex适配器 | ✅ 完成 |
| 6 | 实现OpenCode适配器 | ✅ 完成 |
| 7 | 前端适配 | ✅ 完成 |
| 8 | 测试和优化 | ✅ 完成 |

---

## 8. 相关文档

- 实现细节：见各适配器文件（adapters/*.js）
