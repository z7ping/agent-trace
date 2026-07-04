-- a-beat.db Schema
-- Version: 2.0
-- 仅存统计摘要，不存原始数据

-- session 摘要
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  project_key TEXT,
  source TEXT,              -- hermes/opencode/claude-code
  start_time TEXT,
  end_time TEXT,
  tool_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  total_duration_ms INTEGER DEFAULT 0
);

-- 按天+工具聚合统计
CREATE TABLE IF NOT EXISTS daily_stats (
  date TEXT,                -- YYYY-MM-DD
  source TEXT,
  tool_name TEXT,
  call_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  avg_duration_ms REAL DEFAULT 0,
  PRIMARY KEY (date, source, tool_name)
);

-- 最近错误（滚动保留 50 条）
CREATE TABLE IF NOT EXISTS recent_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT,
  session_id TEXT,
  source TEXT,
  tool_name TEXT,
  error_message TEXT
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_key);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);
CREATE INDEX IF NOT EXISTS idx_recent_errors_ts ON recent_errors(ts DESC);

-- 时间线（原始调用记录）
CREATE TABLE IF NOT EXISTS timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  session_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  seq INTEGER,
  role TEXT NOT NULL,
  tool_name TEXT,
  content TEXT,
  tool_input TEXT,
  success INTEGER,
  exit_code INTEGER,
  duration_ms REAL,
  output_snippet TEXT,
  error_message TEXT,
  project_key TEXT,
  parent_seq INTEGER
);

CREATE INDEX IF NOT EXISTS idx_timeline_session ON timeline(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_timeline_source ON timeline(source, timestamp);
CREATE UNIQUE INDEX IF NOT EXISTS idx_timeline_dedup ON timeline(session_id, timestamp, tool_name);
