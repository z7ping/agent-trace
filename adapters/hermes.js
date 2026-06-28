#!/usr/bin/env node
/**
 * Hermes 适配器
 * 从 ~/.hermes/state.db 轮询工具调用记录，转换为统一格式
 */

const fs = require('fs');
const path = require('path');
const BaseAdapter = require('./base');

const HOME_DIR = require('os').homedir();
const STATE_DB = path.join(HOME_DIR, '.hermes', 'state.db');

class HermesAdapter extends BaseAdapter {
    constructor() {
        super();
        this._db = null;
        this._prepared = {};
    }

    get name() {
        return 'hermes';
    }

    // ─── 数据库连接 ─────────────────────────────────────────

    /**
     * 懒加载 SQLite 连接（只读，不写入 Hermes 的数据库）
     * @returns {import('better-sqlite3').Database|null}
     */
    _getDb() {
        if (this._db) return this._db;
        if (!fs.existsSync(STATE_DB)) return null;

        try {
            const Database = require('better-sqlite3');
            this._db = new Database(STATE_DB, { readonly: true, fileMustExist: true });
            return this._db;
        } catch (e) {
            this.logError(e, 'hermes:db');
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

        this._prepared.findAssistantByToolCallId = db.prepare(`
            SELECT m.id, m.timestamp, m.tool_calls
            FROM messages m, json_each(m.tool_calls) j
            WHERE m.role = 'assistant' AND m.tool_calls IS NOT NULL
            AND json_extract(j.value, '$.id') = ?
            ORDER BY m.id DESC
            LIMIT 1
        `);
    }

    // ─── PreToolUse ────────────────────────────────────────

    /**
     * Hermes 无 PreToolUse 钩子，轮询模式下无需 pre()
     */
    async pre(data) {
        // no-op
    }

    // ─── PostToolUse ───────────────────────────────────────

    /**
     * 从 tool_calls JSON 中提取指定 tool_call_id 的输入
     * @param {string} toolCallsJson - assistant 消息的 tool_calls 字段
     * @param {string} toolCallId - 要匹配的 tool_call_id
     * @returns {{ toolName: string, args: Object }|null}
     */
    _extractToolCallInput(toolCallsJson, toolCallId) {
        try {
            const toolCalls = JSON.parse(toolCallsJson);
            if (!Array.isArray(toolCalls)) return null;

            const tc = toolCalls.find(t => (t.id || t.call_id) === toolCallId);
            if (!tc) return null;

            const toolName = tc.function?.name || tc.name || 'unknown';
            let args = {};
            if (tc.function?.arguments) {
                args = typeof tc.function.arguments === 'string'
                    ? JSON.parse(tc.function.arguments)
                    : tc.function.arguments;
            }

            return { toolName, args };
        } catch (_) {
            return null;
        }
    }

    /**
     * 摘要化 Hermes 工具输入
     * @param {string} toolName
     * @param {Object} args
     * @returns {Object}
     */
    summarizeInput(toolName, args) {
        if (!args || typeof args !== 'object') return {};

        const summary = {};

        if (toolName === 'terminal') {
            const cmd = String(args.command || '');
            summary.command = cmd.length > 120 ? cmd.substring(0, 120) + '…' : cmd;
        } else if (toolName === 'file_editor') {
            summary.file_path = args.file_path || args.path || '';
            if (args.old_string) {
                summary.old_len = args.old_string.length;
                summary.new_len = (args.new_string || '').length;
            }
        } else if (toolName === 'web_search') {
            summary.query = String(args.query || '').substring(0, 100);
        } else if (toolName === 'skill_view' || toolName === 'skill_manage') {
            summary.skill = args.name || '';
        } else if (toolName === 'memory') {
            summary.action = args.action || '';
        } else {
            summary.keys = Object.keys(args).slice(0, 8);
        }

        return summary;
    }

    /**
     * 判断工具调用是否成功
     * @param {string} contentJson - tool 消息的 content 字段（JSON 字符串）
     * @returns {{ success: boolean, error: string|null, exitCode: number|null }}
     */
    _judgeSuccess(contentJson) {
        let success = true;
        let errorMsg = null;
        let exitCode = null;

        try {
            const content = JSON.parse(contentJson);
            exitCode = content.exit_code ?? null;
            if (content.success === false) {
                success = false;
                errorMsg = content.error || 'Tool reported failure';
            }
            if (exitCode !== null && exitCode !== 0) {
                success = false;
                errorMsg = `Exit code ${exitCode}` + (errorMsg ? ': ' + errorMsg : '');
            }
            if (!success && content.error) {
                success = false;
                errorMsg = (errorMsg ? errorMsg + ': ' : '') + String(content.error).substring(0, 300);
            }
        } catch (_) {
            // 非 JSON 格式，无法判断
        }

        return { success, error: errorMsg, exitCode };
    }

    /**
     * 构建统一格式记录
     * @param {Object} msg - 数据库消息行
     * @param {string} sessionId
     * @param {string} projectKey
     * @param {string} projectName
     * @param {string} cwd
     * @returns {Object}
     */
    _buildRecord(msg, sessionId, projectKey, projectName, cwd) {
        // 通过 tool_call_id 查找对应的 assistant 消息获取输入
        let toolName = msg.tool_name || 'unknown';
        let inputSummary = {};

        let assistant = null;
        if (msg.tool_call_id) {
            const likePattern = `%${msg.tool_call_id}%`;
            assistant = this._prepared.findAssistantByToolCallId.get(likePattern);

            if (assistant) {
                const extracted = this._extractToolCallInput(assistant.tool_calls, msg.tool_call_id);
                if (extracted) {
                    toolName = extracted.toolName;
                    inputSummary = this.summarizeInput(toolName, extracted.args);
                }
            }
        }

        const { success, error, exitCode } = this._judgeSuccess(msg.content);

        // 计算耗时：tool 消息时间戳 - assistant 消息时间戳
        let durationMs = null;
        if (assistant) {
            durationMs = Math.round((msg.timestamp - assistant.timestamp) * 1000) / 1000;
        }

        // 转换时间戳（秒 -> ISO）
        const ts = new Date(msg.timestamp * 1000).toISOString();

        const record = {
            ts,
            session_id: sessionId,
            project_key: projectKey,
            project_name: projectName,
            tool_name: toolName,
            source: this.name,
            input_summary: inputSummary,
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

    // ─── getRecords（供 /api/timeline 直接读取 state.db）────────

    /**
     * 从 state.db 查询工具调用记录，返回统一格式
     * @param {Object} filter
     * @param {string} [filter.session_id]
     * @param {string} [filter.project_key]
     * @param {string} [filter.source]
     * @param {number} [filter.limit=1000]
     * @returns {Array}
     */
    async getRecords(filter = {}) {
        const db = this._getDb();
        if (!db) return [];

        const limit = Math.min(parseInt(filter.limit, 10) || 1000, 10000);
        const sessionId = filter.session_id;

        // 查询所有 tool 消息（包含已处理和未处理的），按时间倒序
        let sql = `
            SELECT m.*, s.cwd
            FROM messages m
            LEFT JOIN sessions s ON m.session_id = s.id
            WHERE m.role = 'tool'
        `;
        const params = [];

        if (sessionId) {
            sql += ' AND m.session_id = ?';
            params.push(sessionId);
        }

        sql += ' ORDER BY m.timestamp DESC LIMIT ?';
        params.push(limit);

        let toolMessages;
        try {
            toolMessages = db.prepare(sql).all(...params);
        } catch (_) {
            return [];
        }

        // 预编译查找 assistant 消息
        const findAssistant = db.prepare(`
            SELECT m.id, m.timestamp, m.tool_calls
            FROM messages m, json_each(m.tool_calls) j
            WHERE m.role = 'assistant' AND m.tool_calls IS NOT NULL
            AND json_extract(j.value, '$.id') = ?
            ORDER BY m.id DESC
            LIMIT 1
        `);

        const items = [];
        for (const msg of toolMessages) {
            const cwd = msg.cwd || '';
            const projectKey = this.getProjectKey(cwd);
            const projectName = this.getProjectName(cwd);

            // 过滤 project_key
            if (filter.project_key && projectKey !== filter.project_key) continue;

            // 过滤 source
            if (filter.source && filter.source !== this.name) continue;

            // 查找 assistant 消息获取 tool_name 和 input
            let toolName = msg.tool_name || 'unknown';
            let inputSummary = {};
            let durationMs = null;
            let assistantTs = null;

            if (msg.tool_call_id) {
                try {
                    const assistant = findAssistant.get(`%${msg.tool_call_id}%`);
                    if (assistant) {
                        const extracted = this._extractToolCallInput(assistant.tool_calls, msg.tool_call_id);
                        if (extracted) {
                            toolName = extracted.toolName;
                            inputSummary = this.summarizeInput(toolName, extracted.args);
                        }
                        assistantTs = assistant.timestamp;
                    }
                } catch (_) {}
            }

            // 计算耗时
            if (assistantTs) {
                durationMs = Math.round((msg.timestamp - assistantTs) * 1000) / 1000;
            }

            // 判断成功/失败
            const { success, error } = this._judgeSuccess(msg.content);

            // 转换时间戳
            const ts = new Date(msg.timestamp * 1000).toISOString();

            const record = {
                ts,
                session_id: msg.session_id,
                project_key: projectKey,
                project_name: projectName,
                tool_name: toolName,
                source: this.name,
                input_summary: inputSummary,
                success,
            };
            if (durationMs !== null) record.duration_ms = durationMs;
            if (!success && error) record.error = error.substring(0, 500).trim();

            items.push(record);
        }

        return items;
    }

    // ─── 直接查询 state.db（供 API 使用）─────────────────────

    /**
     * 从 state.db 查询 session 列表
     * @param {Object} filter
     * @param {string} [filter.project_key]
     * @param {number} [filter.limit=50]
     * @returns {Array}
     */
    async getSessions(filter = {}) {
        const db = this._getDb();
        if (!db) return [];

        const limit = Math.min(parseInt(filter.limit, 10) || 50, 200);

        let sql = 'SELECT * FROM sessions';
        const params = [];

        if (filter.project_key) {
            sql += ' WHERE cwd IS NOT NULL';
            // 需要在应用层过滤 project_key（因为 state.db 没有 project_key 字段）
        }

        sql += ' ORDER BY started_at DESC LIMIT ?';
        params.push(limit);

        let sessions;
        try {
            sessions = db.prepare(sql).all(...params);
        } catch (_) {
            return [];
        }

        // 转换为统一格式
        return sessions
            .map(s => {
                const cwd = s.cwd || '';
                const projectKey = this.getProjectKey(cwd);
                // 过滤 project_key
                if (filter.project_key && projectKey !== filter.project_key) return null;
                return {
                    session_id: s.id,
                    project_key: projectKey,
                    source: this.name,
                    start_time: s.started_at ? new Date(s.started_at * 1000).toISOString() : '',
                    end_time: s.ended_at ? new Date(s.ended_at * 1000).toISOString() : '',
                    tool_count: s.tool_call_count || 0,
                    error_count: 0, // state.db 没有直接的错误计数
                    total_duration_ms: 0,
                };
            })
            .filter(Boolean)
            .slice(0, limit);
    }

    /**
     * 从 state.db 聚合统计数据
     * @param {Object} filter
     * @param {string} [filter.since] - 日期字符串 YYYY-MM-DD
     * @returns {Object} { totals, byTool, bySource, byDay }
     */
    async getStats(filter = {}) {
        const db = this._getDb();
        if (!db) return { totals: { total_calls: 0, total_errors: 0, session_count: 0 }, byTool: [], bySource: [], byDay: [] };

        try {
            // 按工具聚合
            let toolSql = `
                SELECT tool_name, COUNT(*) as count,
                       SUM(CASE WHEN content LIKE '%"exit_code":%' OR content LIKE '%"error"%' THEN 1 ELSE 0 END) as errors
                FROM messages WHERE role = 'tool'
            `;
            const toolParams = [];
            if (filter.since) {
                toolSql += ' AND timestamp >= ?';
                toolParams.push(new Date(filter.since).getTime() / 1000);
            }
            toolSql += ' GROUP BY tool_name ORDER BY count DESC';
            const byTool = db.prepare(toolSql).all(...toolParams);

            // 按天聚合
            let daySql = `
                SELECT date(timestamp, 'unixepoch', 'localtime') as date, COUNT(*) as count,
                       SUM(CASE WHEN content LIKE '%"exit_code":%' OR content LIKE '%"error"%' THEN 1 ELSE 0 END) as errors
                FROM messages WHERE role = 'tool'
            `;
            const dayParams = [];
            if (filter.since) {
                daySql += ' AND timestamp >= ?';
                dayParams.push(new Date(filter.since).getTime() / 1000);
            }
            daySql += ' GROUP BY date ORDER BY date ASC';
            const byDay = db.prepare(daySql).all(...dayParams);

            // 总体统计
            let totalSql = `
                SELECT COUNT(*) as total_calls,
                       SUM(CASE WHEN content LIKE '%"exit_code":%' OR content LIKE '%"error"%' THEN 1 ELSE 0 END) as total_errors
                FROM messages WHERE role = 'tool'
            `;
            const totalParams = [];
            if (filter.since) {
                totalSql += ' AND timestamp >= ?';
                totalParams.push(new Date(filter.since).getTime() / 1000);
            }
            const totals = db.prepare(totalSql).get(...totalParams);

            // session 数量
            let sessionSql = 'SELECT COUNT(*) as session_count FROM sessions';
            const sessionParams = [];
            if (filter.since) {
                sessionSql += ' WHERE started_at >= ?';
                sessionParams.push(new Date(filter.since).getTime() / 1000);
            }
            const sessionCount = db.prepare(sessionSql).get(...sessionParams);
            totals.session_count = sessionCount.session_count;

            return {
                totals,
                byTool,
                bySource: [{ source: this.name, count: totals.total_calls, errors: totals.total_errors }],
                byDay,
            };
        } catch (_) {
            return { totals: { total_calls: 0, total_errors: 0, session_count: 0 }, byTool: [], bySource: [], byDay: [] };
        }
    }

    /**
     * 从 state.db 聚合工具使用统计
     * @returns {Array} [{ tool_name, count, errors }]
     */
    async getTools() {
        const db = this._getDb();
        if (!db) return [];

        try {
            return db.prepare(`
                SELECT tool_name, COUNT(*) as count,
                       SUM(CASE WHEN content LIKE '%"exit_code":%' OR content LIKE '%"error"%' THEN 1 ELSE 0 END) as errors
                FROM messages WHERE role = 'tool'
                GROUP BY tool_name ORDER BY count DESC
            `).all();
        } catch (_) {
            return [];
        }
    }

}

module.exports = HermesAdapter;
