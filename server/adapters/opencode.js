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
// 可配置：轮询间隔（毫秒），默认 30 分钟
const POLL_INTERVAL_MS = parseInt(process.env.OPENCODE_POLL_INTERVAL_MS, 10) || 30 * 60 * 1000;
// 可配置：每次轮询最大处理条数，默认 100
const POLL_BATCH_SIZE = parseInt(process.env.OPENCODE_POLL_BATCH_SIZE, 10) || 100;

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
    async _getDb() {
        if (this._db) return this._db;
        if (!fs.existsSync(OPENCODE_DB)) return null;

        try {
            const { openDb } = require('../db');
            this._db = openDb(OPENCODE_DB, { readonly: true });
            await this._db.ready();
            return this._db;
        } catch (e) {
            this.logError(e, 'opencode:db');
            return null;
        }
    }

    /**
     * 预编译常用查询
     */
    async _ensurePrepared() {
        if (Object.keys(this._prepared).length > 0) return;
        const db = await this._getDb();
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
            LIMIT ?
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
        await this._ensurePrepared();
        const db = await this._getDb();
        if (!db || !this._prepared.fetchToolParts) return;

        try {
            const toolParts = this._prepared.fetchToolParts.all(this._lastProcessedTs, POLL_BATCH_SIZE);
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

                    // 聚合写入 a-beat.db
                    this._aggregateToDb(record, sessionId, projectKey);
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

    _aggregateToDb(record, sessionId, projectKey) {
        try {
            const abeatDb = require('../abeat-db');
            const ts = record.ts || '';
            const date = ts.slice(0, 10);

            // 按天统计
            abeatDb.updateDailyStats(date, 'opencode', record.tool_name, 1, record.success ? 0 : 1, record.duration_ms || 0);

            // 错误记录
            if (!record.success && record.error) {
                abeatDb.saveError(ts, sessionId, 'opencode', record.tool_name, record.error);
            }

            // session 摘要（累加）
            abeatDb.upsertSession({
                session_id: sessionId,
                project_key: projectKey,
                source: 'opencode',
                start_time: ts,
                end_time: ts,
                tool_count: 1,
                error_count: record.success ? 0 : 1,
                total_duration_ms: record.duration_ms || 0,
            });
        } catch (_) {}
    }

    // ─── getRecords（供 /api/timeline 直接读取 opencode.db）──────

    /**
     * 从 opencode.db 查询工具调用记录，返回统一格式
     * @param {Object} filter
     * @param {string} [filter.session_id]
     * @param {string} [filter.project_key]
     * @param {string} [filter.source]
     * @param {number} [filter.limit=1000]
     * @returns {Array}
     */
    async getRecords(filter = {}) {
        const db = await this._getDb();
        if (!db) return [];

        const limit = Math.min(parseInt(filter.limit, 10) || 1000, 10000);
        const sessionId = filter.session_id;

        let sql = `
            SELECT p.id, p.session_id, p.time_created, p.data,
                   s.directory
            FROM part p
            LEFT JOIN session s ON p.session_id = s.id
            WHERE p.data LIKE '%"type":"tool"%'
        `;
        const params = [];

        if (sessionId) {
            sql += ' AND p.session_id = ?';
            params.push(sessionId);
        }

        sql += ' ORDER BY p.time_created DESC LIMIT ?';
        params.push(limit);

        let toolParts;
        try {
            toolParts = db.prepare(sql).all(...params);
        } catch (_) {
            return [];
        }

        const items = [];
        for (const part of toolParts) {
            const record = this._buildRecord(part);
            if (!record) continue;

            // 过滤 project_key
            if (filter.project_key && record.project_key !== filter.project_key) continue;

            // 过滤 source
            if (filter.source && filter.source !== this.name) continue;

            items.push(record);
        }

        return items;
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

}

module.exports = OpenCodeAdapter;
