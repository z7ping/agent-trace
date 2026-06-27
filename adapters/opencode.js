#!/usr/bin/env node
/**
 * OpenCode 适配器
 * 从 ~/.local/share/opencode/opencode.db 轮询工具调用记录，转换为统一格式
 * 数据源：part 表（type='tool' 的记录），通过 session 表获取项目目录
 */

const fs = require('fs');
const path = require('path');
const BaseAdapter = require('./base');

const HOME_DIR = require('os').homedir();
const OPENCODE_DB = path.join(HOME_DIR, '.local', 'share', 'opencode', 'opencode.db');
const POLL_INTERVAL_MS = 5000;

class OpenCodeAdapter extends BaseAdapter {
    constructor() {
        super();
        this._pollTimer = null;
        this._db = null;
        this._prepared = {};
        this._lastProcessedTs = 0; // 已处理的最高 time_created
    }

    get name() {
        return 'opencode';
    }

    // ─── 数据库连接 ─────────────────────────────────────────

    /**
     * 懒加载 SQLite 连接（只读）
     * @returns {import('better-sqlite3').Database|null}
     */
    _getDb() {
        if (this._db) return this._db;
        if (!fs.existsSync(OPENCODE_DB)) return null;

        try {
            const Database = require('better-sqlite3');
            this._db = new Database(OPENCODE_DB, { readonly: true });
            return this._db;
        } catch (e) {
            this.logError(e, 'opencode:db');
            return null;
        }
    }

    /**
     * 预编译常用查询
     */
    _ensurePrepared() {
        if (Object.keys(this._prepared).length > 0) return;
        const db = this._getDb();
        if (!db) return;

        // 查询未处理的 tool 类型 part，关联 session 获取项目目录
        this._prepared.fetchToolParts = db.prepare(`
            SELECT p.id, p.message_id, p.session_id, p.time_created, p.data,
                   s.directory
            FROM part p
            LEFT JOIN session s ON p.session_id = s.id
            WHERE p.data LIKE '%"type":"tool"%'
              AND p.time_created > ?
            ORDER BY p.time_created ASC
        `);

        // 标记已处理（使用时间戳水位线）
        this._prepared.getLastTs = db.prepare(`
            SELECT MAX(time_created) as max_ts FROM part
            WHERE time_created <= ?
        `);
    }

    // ─── PreToolUse ────────────────────────────────────────

    /**
     * OpenCode 无 PreToolUse 钩子，轮询模式下无需 pre()
     */
    async pre(data) {
        // no-op
    }

    // ─── PostToolUse ───────────────────────────────────────

    /**
     * 摘要化 OpenCode 工具输入
     * @param {string} toolName
     * @param {Object} input
     * @returns {Object}
     */
    _summarizeInput(toolName, input) {
        if (!input || typeof input !== 'object') return {};

        const summary = {};

        if (toolName === 'bash') {
            const cmd = String(input.command || '');
            summary.command = cmd.length > 120 ? cmd.substring(0, 120) + '…' : cmd;
        } else if (toolName === 'read') {
            summary.file_path = input.filePath || input.file_path || '';
        } else if (toolName === 'write' || toolName === 'edit') {
            summary.file_path = input.filePath || input.file_path || '';
        } else if (toolName === 'grep') {
            summary.pattern = String(input.pattern || '').substring(0, 100);
            summary.path = input.path || '';
        } else if (toolName === 'task') {
            summary.description = String(input.description || '').substring(0, 100);
        } else {
            summary.keys = Object.keys(input).slice(0, 8);
        }

        return summary;
    }

    /**
     * 判断工具调用是否成功
     * @param {string} status - part state.status
     * @param {string} output - part state.output（文本）
     * @returns {{ success: boolean, error: string|null }}
     */
    _judgeSuccess(status, output) {
        let success = true;
        let errorMsg = null;

        // 基于 status 判断
        if (status && status !== 'completed') {
            success = false;
            errorMsg = `Status: ${status}`;
        }

        return { success, error: errorMsg };
    }

    /**
     * 从 part data JSON 中提取并转换为统一格式
     * @param {Object} row - 数据库行
     * @returns {Object|null}
     */
    _buildRecord(row) {
        let data;
        try {
            data = JSON.parse(row.data);
        } catch (_) {
            return null;
        }

        // 只处理 tool 类型
        if (data.type !== 'tool') return null;

        const toolName = data.tool || 'unknown';
        const state = data.state || {};
        const input = state.input || {};
        const output = state.output || '';

        // 计算耗时（time.start / time.end 为毫秒时间戳）
        let durationMs = null;
        if (state.time && typeof state.time.start === 'number' && typeof state.time.end === 'number') {
            durationMs = Math.round((state.time.end - state.time.start) * 1000) / 1000;
        }

        // 判断成功/失败
        const { success, error } = this._judgeSuccess(state.status, output);

        // 从 part.time_created 获取 ISO 时间戳（毫秒）
        const ts = new Date(row.time_created).toISOString();

        // 从 session.directory 获取项目目录
        const cwd = row.directory || process.cwd();
        const projectKey = this.getProjectKey(cwd);
        const projectName = this.getProjectName(cwd);

        const record = {
            ts,
            session_id: row.session_id,
            project_key: projectKey,
            project_name: projectName,
            tool_name: toolName,
            source: this.name,
            input_summary: this._summarizeInput(toolName, input),
            success,
        };

        if (durationMs !== null) {
            record.duration_ms = durationMs;
        }
        if (!success && error) {
            record.error = error.substring(0, 500).trim();
        }

        return record;
    }

    /**
     * 轮询一次：读取未处理的 tool 类型 part，转换并写入日志
     */
    async _pollOnce() {
        this._ensurePrepared();
        const db = this._getDb();
        if (!db || !this._prepared.fetchToolParts) return;

        try {
            const toolParts = this._prepared.fetchToolParts.all(this._lastProcessedTs);
            if (toolParts.length === 0) return;

            // 按 session 分组处理
            const bySession = new Map();
            for (const part of toolParts) {
                const sid = part.session_id;
                if (!bySession.has(sid)) bySession.set(sid, []);
                bySession.get(sid).push(part);
            }

            for (const [sessionId, parts] of bySession) {
                const cwd = parts[0].directory || process.cwd();
                const projectKey = this.getProjectKey(cwd);
                const projectName = this.getProjectName(cwd);

                this.updateProjectsFile(projectKey, cwd, projectName);

                for (const part of parts) {
                    const record = this._buildRecord(part);
                    if (!record) continue;

                    const logFile = this.getLogFile(projectKey);
                    fs.appendFileSync(logFile, JSON.stringify(record) + '\n', 'utf-8');
                    this._writeToSqlite(record);
                }
            }

            // 更新水位线：取本次处理的最高 time_created
            const maxTs = Math.max(...toolParts.map(p => p.time_created));
            if (maxTs > this._lastProcessedTs) {
                this._lastProcessedTs = maxTs;
            }
        } catch (e) {
            this.logError(e, 'opencode:poll');
        }
    }

    _writeToSqlite(record) {
        const dbFile = require('path').join(require('./base').BASE_DIR || require('path').join(__dirname, '..'), 'tracker.db');
        if (!require('fs').existsSync(dbFile)) return;
        let Database;
        try { Database = require('better-sqlite3'); } catch (_) { return; }
        if (!this._db_sqlite) {
            try { this._db_sqlite = new Database(dbFile); } catch (_) { return; }
        }
        try {
            this._db_sqlite.prepare('INSERT OR IGNORE INTO projects (project_key, name, cwd, last_seen) VALUES (?, ?, ?, ?)').run(record.project_key, record.project_name, '', record.ts);
            this._db_sqlite.prepare('UPDATE projects SET last_seen = ? WHERE project_key = ?').run(record.ts, record.project_key);
            if (record.session_id) {
                this._db_sqlite.prepare('INSERT OR IGNORE INTO sessions (session_id, project_key, start_time, tool_count) VALUES (?, ?, ?, 0)').run(record.session_id, record.project_key, record.ts);
                this._db_sqlite.prepare('UPDATE sessions SET tool_count = tool_count + 1 WHERE session_id = ?').run(record.session_id);
            }
            this._db_sqlite.prepare('INSERT INTO tool_calls (ts, session_id, project_key, tool_name, input_summary, success, seq, parent_seq, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(record.ts, record.session_id || '', record.project_key, record.tool_name, JSON.stringify(record.input_summary), record.success ? 1 : 0, record.seq || null, record.parent_seq || null, record.duration_ms || null, record.error || null);
        } catch (e) { try { require('fs').appendFileSync(require('path').join(require('./base').BASE_DIR || require('path').join(__dirname, '..'), 'trace_error.log'), '[' + new Date().toISOString() + '] SQLite error: ' + e.message + '\n'); } catch (_) {} }
    }

    // ─── 启动/停止轮询 ──────────────────────────────────────

    /**
     * 启动轮询
     * @param {number} intervalMs - 轮询间隔（毫秒），默认 5000
     */
    startPolling(intervalMs = POLL_INTERVAL_MS) {
        if (this._pollTimer) return;

        // 立即执行一次
        this._pollOnce();

        this._pollTimer = setInterval(() => this._pollOnce(), intervalMs);
    }

    /**
     * 停止轮询并关闭数据库
     */
    stopPolling() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
        if (this._db) {
            try { this._db.close(); } catch (_) {}
            this._db = null;
        }
    }

    // ─── getRecords ────────────────────────────────────────

    /**
     * 获取工具调用记录
     * @param {Object} filter - 过滤条件
     * @param {string} filter.project_key
     * @param {string} filter.session_id
     * @param {number} filter.limit
     * @returns {Array}
     */
    async getRecords(filter = {}) {
        const { project_key, session_id, limit = 100 } = filter;
        const records = [];

        if (project_key) {
            const logFile = this.getLogFile(project_key);
            if (fs.existsSync(logFile)) {
                const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
                for (const line of lines) {
                    try {
                        const record = JSON.parse(line);
                        if (session_id && record.session_id !== session_id) continue;
                        records.push(record);
                    } catch (_) {}
                }
            }
        } else {
            const logsDir = path.join(__dirname, '..', 'logs');
            if (fs.existsSync(logsDir)) {
                const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.jsonl'));
                for (const file of files) {
                    const logFile = path.join(logsDir, file);
                    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
                    for (const line of lines) {
                        try {
                            const record = JSON.parse(line);
                            if (record.source !== this.name) continue;
                            if (session_id && record.session_id !== session_id) continue;
                            records.push(record);
                        } catch (_) {}
                    }
                }
            }
        }

        return records.slice(-limit);
    }
}

module.exports = OpenCodeAdapter;
