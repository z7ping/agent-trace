/**
 * tracker-db.js - 统一 SQLite 存储层
 *
 * 所有适配器写入 tracker.db，server.js 从 tracker.db 读取。
 * 替代之前的 JSONL 文件方案。
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'tracker.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const LOGS_DIR = path.join(__dirname, 'logs');

let _db = null;

// ─── 数据库初始化 ──────────────────────────────────────

function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  // 执行 schema
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  _db.exec(schema);
  return _db;
}

function closeDb() {
  if (_db) { _db.close(); _db = null; }
}

// ─── 写入方法 ──────────────────────────────────────────

/** 写入一条工具调用记录 */
function writeToolCall(record) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO tool_calls
      (ts, session_id, project_key, tool_name, input_summary, success, seq, parent_seq, duration_ms, error, source)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    record.ts || record.timestamp,
    record.session_id,
    record.project_key,
    record.tool_name,
    record.input_summary ? JSON.stringify(record.input_summary) : null,
    record.success !== false ? 1 : 0,
    record.seq || null,
    record.parent_seq || null,
    record.duration_ms || null,
    record.error || null,
    record.source || null
  );
}

/** 批量写入（事务） */
function writeToolCalls(records) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO tool_calls
      (ts, session_id, project_key, tool_name, input_summary, success, seq, parent_seq, duration_ms, error, source)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((items) => {
    let count = 0;
    for (const r of items) {
      const result = stmt.run(
        r.ts || r.timestamp,
        r.session_id,
        r.project_key,
        r.tool_name,
        r.input_summary ? (typeof r.input_summary === 'string' ? r.input_summary : JSON.stringify(r.input_summary)) : null,
        r.success !== false ? 1 : 0,
        r.seq || null,
        r.parent_seq || null,
        r.duration_ms || null,
        r.error || null,
        r.source || null
      );
      if (result.changes > 0) count++;
    }
    return count;
  });
  return insertMany(records);
}

/** 更新项目信息 */
function upsertProject(projectKey, name, cwd) {
  const db = getDb();
  db.prepare(`
    INSERT INTO projects (project_key, name, cwd, last_seen)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(project_key) DO UPDATE SET
      name = excluded.name,
      cwd = excluded.cwd,
      last_seen = CURRENT_TIMESTAMP
  `).run(projectKey, name, cwd);
}

/** 更新或创建会话 */
function upsertSession(sessionId, projectKey) {
  const db = getDb();
  db.prepare(`
    INSERT INTO sessions (session_id, project_key, start_time, tool_count)
    VALUES (?, ?, CURRENT_TIMESTAMP, 0)
    ON CONFLICT(session_id) DO UPDATE SET
      tool_count = tool_count + 1
  `).run(sessionId, projectKey);
}

// ─── 查询方法 ──────────────────────────────────────────

/** 查询所有项目 */
function queryProjects() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM projects ORDER BY last_seen DESC').all();
  const result = {};
  for (const r of rows) {
    result[r.project_key] = { name: r.name, cwd: r.cwd, last_seen: r.last_seen };
  }
  return result;
}

/** 查询工具调用记录 */
function queryToolCalls(options = {}) {
  const db = getDb();
  const { projectKey, source, session_id, limit = 10000, offset = 0 } = options;
  let sql = 'SELECT * FROM tool_calls WHERE 1=1';
  const params = [];

  if (projectKey) { sql += ' AND project_key = ?'; params.push(projectKey); }
  if (source) { sql += ' AND source = ?'; params.push(source); }
  if (session_id) { sql += ' AND session_id = ?'; params.push(session_id); }

  sql += ' ORDER BY ts ASC';
  if (limit) { sql += ' LIMIT ?'; params.push(limit); }
  if (offset) { sql += ' OFFSET ?'; params.push(offset); }

  return db.prepare(sql).all(...params);
}

/** 查询会话列表 */
function querySessions(options = {}) {
  const db = getDb();
  const { projectKey, source } = options;
  let sql = `
    SELECT s.*,
      (SELECT COUNT(*) FROM tool_calls tc WHERE tc.session_id = s.session_id) as call_count,
      (SELECT MIN(tc.ts) FROM tool_calls tc WHERE tc.session_id = s.session_id) as start_ts,
      (SELECT MAX(tc.ts) FROM tool_calls tc WHERE tc.session_id = s.session_id) as end_ts,
      (SELECT tc.source FROM tool_calls tc WHERE tc.session_id = s.session_id LIMIT 1) as source
    FROM sessions s
    WHERE 1=1
  `;
  const params = [];

  if (projectKey) { sql += ' AND s.project_key = ?'; params.push(projectKey); }
  if (source) {
    sql += ' AND s.session_id IN (SELECT session_id FROM tool_calls WHERE source = ?)';
    params.push(source);
  }

  sql += ' ORDER BY start_ts DESC';
  return db.prepare(sql).all(...params);
}

/** 统计信息 */
function queryStats(options = {}) {
  const db = getDb();
  const { projectKey, source } = options;
  let where = 'WHERE 1=1';
  const params = [];
  if (projectKey) { where += ' AND project_key = ?'; params.push(projectKey); }
  if (source) { where += ' AND source = ?'; params.push(source); }

  const total = db.prepare(`SELECT COUNT(*) as c FROM tool_calls ${where}`).get(...params);
  const errors = db.prepare(`SELECT COUNT(*) as c FROM tool_calls ${where} AND success = 0`).get(...params);
  const byTool = db.prepare(`SELECT tool_name, COUNT(*) as count FROM tool_calls ${where} GROUP BY tool_name ORDER BY count DESC`).all(...params);
  const bySource = db.prepare(`SELECT source, COUNT(*) as count FROM tool_calls ${where} GROUP BY source ORDER BY count DESC`).all(...params);

  return {
    total: total.c,
    errors: errors.c,
    errorRate: total.c > 0 ? (errors.c / total.c * 100).toFixed(1) + '%' : '0%',
    byTool,
    bySource,
  };
}

// ─── JSONL 迁移 ────────────────────────────────────────

/** 将 JSONL 文件迁移到 SQLite */
function migrateJsonlToSqlite() {
  if (!fs.existsSync(LOGS_DIR)) return 0;

  const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.jsonl'));
  let totalImported = 0;

  for (const file of files) {
    const filePath = path.join(LOGS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    if (!content) continue;

    const records = content.split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);

    if (records.length === 0) continue;

    // 先创建/更新 sessions 和 projects
    for (const r of records) {
      if (r.project_key || r.cwd) {
        const key = r.project_key || r.session_id?.slice(0, 12) || 'unknown';
        const name = r.project_name || r.project || key;
        const cwd = r.cwd || '';
        upsertProject(key, name, cwd);
      }
      if (r.session_id) {
        const projectKey = r.project_key || r.session_id?.slice(0, 12) || 'unknown';
        upsertSession(r.session_id, projectKey);
      }
    }

    const imported = writeToolCalls(records);
    totalImported += imported;

    // 备份原 JSONL
    const backupDir = path.join(LOGS_DIR, '.backup');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(filePath, path.join(backupDir, file));
  }

  return totalImported;
}

// ─── 导出 ──────────────────────────────────────────────

module.exports = {
  getDb,
  closeDb,
  writeToolCall,
  writeToolCalls,
  upsertProject,
  upsertSession,
  queryProjects,
  queryToolCalls,
  querySessions,
  queryStats,
  migrateJsonlToSqlite,
  DB_PATH,
};
