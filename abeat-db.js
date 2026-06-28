/**
 * abeat-db.js - 统计摘要存储层
 *
 * 只存聚合结果，不存原始数据。
 * 原始数据由适配器直接查各自的数据源 DB。
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'a-beat.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let _db = null;

// ─── 数据库初始化 ──────────────────────────────────────

function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  _db.exec(schema);
  return _db;
}

function closeDb() {
  if (_db) { _db.close(); _db = null; }
}

// ─── 写入方法 ──────────────────────────────────────────

/** 写入/更新 session 摘要 */
function upsertSession(session) {
  const db = getDb();
  db.prepare(`
    INSERT INTO sessions (session_id, project_key, source, start_time, end_time, tool_count, error_count, total_duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      end_time = excluded.end_time,
      tool_count = excluded.tool_count,
      error_count = excluded.error_count,
      total_duration_ms = excluded.total_duration_ms
  `).run(
    session.session_id,
    session.project_key || '',
    session.source || '',
    session.start_time || '',
    session.end_time || '',
    session.tool_count || 0,
    session.error_count || 0,
    session.total_duration_ms || 0
  );
}

/** 累加按天统计 */
function updateDailyStats(date, source, toolName, callCount, errorCount, avgDurationMs) {
  const db = getDb();
  db.prepare(`
    INSERT INTO daily_stats (date, source, tool_name, call_count, error_count, avg_duration_ms)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, source, tool_name) DO UPDATE SET
      call_count = call_count + excluded.call_count,
      error_count = error_count + excluded.error_count,
      avg_duration_ms = (avg_duration_ms + excluded.avg_duration_ms) / 2
  `).run(date, source, toolName, callCount || 0, errorCount || 0, avgDurationMs || 0);
}

/** 保存最近错误（超过 50 条删除最旧） */
function saveError(ts, sessionId, source, toolName, errorMessage) {
  const db = getDb();
  db.prepare(`
    INSERT INTO recent_errors (ts, session_id, source, tool_name, error_message)
    VALUES (?, ?, ?, ?, ?)
  `).run(ts, sessionId, source, toolName, errorMessage);

  // 保留最近 50 条
  db.prepare(`
    DELETE FROM recent_errors WHERE id NOT IN (
      SELECT id FROM recent_errors ORDER BY ts DESC LIMIT 50
    )
  `).run();
}

// ─── 查询方法 ──────────────────────────────────────────

/** 查询统计信息（仪表盘用） */
function queryStats(options = {}) {
  const db = getDb();
  const { source, since } = options;
  let where = 'WHERE 1=1';
  const params = [];
  if (source) { where += ' AND source = ?'; params.push(source); }
  if (since) { where += ' AND date >= ?'; params.push(since); }

  const byTool = db.prepare(`
    SELECT tool_name, SUM(call_count) as count, SUM(error_count) as errors, AVG(avg_duration_ms) as avg_duration_ms
    FROM daily_stats ${where}
    GROUP BY tool_name ORDER BY count DESC
  `).all(...params);

  const bySource = db.prepare(`
    SELECT source, SUM(call_count) as count, SUM(error_count) as errors
    FROM daily_stats ${where}
    GROUP BY source ORDER BY count DESC
  `).all(...params);

  const byDay = db.prepare(`
    SELECT date, SUM(call_count) as count, SUM(error_count) as errors
    FROM daily_stats ${where}
    GROUP BY date ORDER BY date ASC
  `).all(...params);

  const totals = db.prepare(`
    SELECT
      SUM(call_count) as total_calls,
      SUM(error_count) as total_errors,
      COUNT(DISTINCT (SELECT session_id FROM sessions)) as session_count
    FROM daily_stats ${where}
  `).get(...params);

  return { totals, byTool, bySource, byDay };
}

/** 查询 session 列表 */
function querySessions(options = {}) {
  const db = getDb();
  const { source, projectKey, limit = 50 } = options;
  let where = 'WHERE 1=1';
  const params = [];
  if (source) { where += ' AND source = ?'; params.push(source); }
  if (projectKey) { where += ' AND project_key = ?'; params.push(projectKey); }

  return db.prepare(`
    SELECT * FROM sessions ${where}
    ORDER BY start_time DESC LIMIT ?
  `).all(...params, limit);
}

/** 获取 session 已有的 total_duration_ms */
function getSessionDuration(sessionId) {
  const db = getDb();
  const row = db.prepare('SELECT total_duration_ms FROM sessions WHERE session_id = ?').get(sessionId);
  return row ? (row.total_duration_ms || 0) : 0;
}

/** 查询最近错误 */
function queryRecentErrors(limit = 50) {
  const db = getDb();
  return db.prepare('SELECT * FROM recent_errors ORDER BY ts DESC LIMIT ?').all(limit);
}

/** 查询按天趋势（图表用） */
function queryDailyTrend(options = {}) {
  const db = getDb();
  const { source, days = 30 } = options;
  let where = `WHERE date >= date('now', '-${days} days')`;
  const params = [];
  if (source) { where += ' AND source = ?'; params.push(source); }

  return db.prepare(`
    SELECT date, source, SUM(call_count) as count, SUM(error_count) as errors
    FROM daily_stats ${where}
    GROUP BY date, source
    ORDER BY date ASC
  `).all(...params);
}

module.exports = {
  getDb,
  closeDb,
  upsertSession,
  getSessionDuration,
  updateDailyStats,
  saveError,
  queryStats,
  querySessions,
  queryRecentErrors,
  queryDailyTrend,
  DB_PATH,
};
