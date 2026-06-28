# 重构计划：tracker.db → a-beat.db（仅存统计摘要）

> 标签：v0.1.0-pre-refactor
> 日期：2026-06-28
> 状态：待执行

## 核心思路

tracker.db 从「全量数据副本」改为「统计缓存」：
- 不复制原始数据
- 只存聚合结果（session 摘要、按天统计、最近错误）
- 仪表盘直接查 a-beat.db（快）
- 调用链走适配器查原始 DB（state.db / opencode.db）

## 任务清单

### #1 重写 schema.sql
- 去掉 `tool_calls` 明细表
- 新增 `sessions`（session 摘要：ID/时间/调用数/错误数/耗时）
- 新增 `daily_stats`（按天+工具聚合：日期/来源/工具名/调用数/错误数/平均耗时）
- 新增 `recent_errors`（滚动保留 50 条：时间/session/来源/工具/错误信息）
- 数据库改名：tracker.db → a-beat.db

### #2 重写 abeat-db.js
- 去掉 `writeToolCall()`、`writeToolCalls()`、`migrateJsonlToSqlite()`
- 新增 `upsertSession()` — 写入/更新 session 摘要
- 新增 `updateDailyStats()` — 累加按天统计
- 新增 `saveError()` — 保存最近错误（超过 50 条时删除最旧）
- 查询方法：`queryStats()`、`querySessions()`、`queryDailyStats()`、`queryRecentErrors()`
- 文件名：tracker-db.js → abeat-db.js

### #3 适配器改造：轮询时边转换边聚合
- hermes.js `_pollOnce()`：
  - 读 state.db 中新的 tool 消息
  - 按 session 分组，计算调用数/错误数/耗时
  - 调用 `upsertSession()` + `updateDailyStats()` + `saveError()`
  - 不再写 JSONL、不再 appendFileSync
- opencode.js 同理
- base.js `getLogFile()` 和 `appendFileSync` 不再需要

### #4 server.js API 适配新 schema
- `getDb()` 改为连接 a-beat.db
- `/api/stats` — 从 daily_stats 聚合
- `/api/sessions` — 从 sessions 表读
- `/api/timeline` — 改为调适配器查原始 DB（hermes 查 state.db，opencode 查 opencode.db）
- `/api/tools` — 从 daily_stats 聚合工具分布
- 去掉启动时的 migrateJsonlToSqlite 调用

### #5 清理废弃代码
- 删除 `migrateJsonlToSqlite()` 函数
- 删除 JSONL 备份逻辑（logs/.backup/）
- 删除旧 tracker.db（备份到 7-dumps/）
- 删除 logs/*.jsonl（归档到 7-dumps/）
- .gitignore 更新：a-beat.db 替代 tracker.db

### #6 前端适配
- `fetchSessionLogs()` — 调用 `/api/timeline`（走适配器查原始 DB）
- 其他 API 调用保持不变（/api/stats、/api/sessions 等）
- 前端不直接碰任何原始 DB

## 不改的
- 前端 UI 布局不动
- 适配器接口不变（startPolling / _pollOnce）
- Claude Code hooks 不动
- vite 构建流程不动
- 配置文件不动（config.js、package.json）
