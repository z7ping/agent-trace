# AI Tool Tracker 多工具适配器架构设计

> 创建日期：2026-06-27
> 状态：设计中

---

## 1. 目标

将AI Tool Tracker从仅支持Claude Code，扩展为支持多工具的统一追踪系统。

支持的工具：
- Claude Code（已有实现）
- Hermes（待实现）
- Codex（待实现）
- OpenCode（待实现）
- Cursor（待实现）

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

### 4.1 Claude Code适配器

**数据源**：hooks/log.js + hooks/prelog.js

**实现方式**：
- 复用现有hooks代码
- 输出统一格式到SQLite

**文件结构**：
```
adapters/
├── base.js              # 基类
├── claude-code.js       # Claude Code适配器
├── hermes.js            # Hermes适配器（待实现）
├── codex.js             # Codex适配器（待实现）
└── index.js             # 适配器注册表
```

### 4.2 Hermes适配器

**数据源**：agent.log + state.db

**实现方式**：
- 解析agent.log文件
- 或直接读取state.db

### 4.3 Codex适配器

**数据源**：state_5.sqlite

**实现方式**：
- 直接读取Codex的SQLite数据库

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

| 阶段 | 任务 | 预估时间 |
|------|------|----------|
| 1 | 设计适配器接口和数据格式 | 1小时 |
| 2 | 实现适配器基类 | 2小时 |
| 3 | 完善Claude Code适配器 | 4小时 |
| 4 | 实现Hermes适配器 | 4小时 |
| 5 | 实现Codex适配器 | 4小时 |
| 6 | 前端适配 | 4小时 |
| 7 | 测试和优化 | 4小时 |

---

## 8. 待确认问题

1. **Hermes的数据源**：用agent.log还是state.db？
2. **Codex的hooks机制**：是否有类似Claude Code的hooks？
3. **实时性要求**：是否需要实时更新，还是定时轮询即可？
4. **数据保留策略**：保留多长时间的历史数据？
