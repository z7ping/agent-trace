-- AI Tool Tracker SQLite Schema
-- Version: 1.0
-- Created: 2026-06-09

-- 项目表：记录每个被监控的项目
CREATE TABLE IF NOT EXISTS projects (
    project_key TEXT PRIMARY KEY,          -- 项目键（工作目录路径 MD5 前 12 位）
    name TEXT NOT NULL,                    -- 项目名称
    cwd TEXT NOT NULL,                     -- 工作目录路径
    last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP  -- 最后活跃时间
);

-- 会话表：记录每个 Claude Code 会话
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,           -- 会话 ID
    project_key TEXT NOT NULL,             -- 关联项目
    start_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- 会话开始时间
    tool_count INTEGER NOT NULL DEFAULT 0, -- 工具调用次数
    FOREIGN KEY (project_key) REFERENCES projects(project_key)
);

-- 工具调用表：核心数据，记录每次工具调用
CREATE TABLE IF NOT EXISTS tool_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 自增 ID
    ts DATETIME NOT NULL,                  -- 时间戳
    session_id TEXT NOT NULL,              -- 会话 ID
    project_key TEXT NOT NULL,             -- 项目键
    tool_name TEXT NOT NULL,               -- 工具名称
    input_summary TEXT,                    -- 输入摘要
    success BOOLEAN NOT NULL DEFAULT TRUE, -- 是否成功
    seq INTEGER,                           -- 调用序号
    parent_seq INTEGER,                    -- 父调用序号（调用链）
    duration_ms INTEGER,                   -- 耗时（毫秒）
    error TEXT,                            -- 错误信息
    source TEXT,                           -- 数据来源（claude-code/hermes/opencode/codex）
    FOREIGN KEY (session_id) REFERENCES sessions(session_id),
    FOREIGN KEY (project_key) REFERENCES projects(project_key)
);

-- 索引：优化查询性能
CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_project ON tool_calls(project_key);
CREATE INDEX IF NOT EXISTS idx_tool_calls_tool ON tool_calls(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_calls_ts ON tool_calls(ts);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_key);
