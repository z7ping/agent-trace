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
// 可配置：轮询间隔（毫秒），默认 30 分钟
const POLL_INTERVAL_MS = parseInt(process.env.HERMES_POLL_INTERVAL_MS, 10) || 30 * 60 * 1000;
// 可配置：每次轮询最大处理条数，默认 100
const POLL_BATCH_SIZE = parseInt(process.env.HERMES_POLL_BATCH_SIZE, 10) || 100;

class HermesAdapter extends BaseAdapter {
    constructor() {
        super();
        this._pollTimer = null;
        this._db = null;
        this._prepared = {};
    }

    get name() {
        return 'hermes';
    }

    // ─── 数据库连接 ─────────────────────────────────────────

    /**
     * 懒加载 SQLite 连接（只读）
     * @returns {import('better-sqlite3').Database|null}
     */
    _getDb() {
        if (this._db) return this._db;
        if (!fs.existsSync(STATE_DB)) return null;

        try {
            // 直接用 better-sqlite3 连接（只读），跳过 db.js 的 LazyDb
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

        this._prepared.fetchToolMessages = db.prepare(`
            SELECT m.*, s.cwd
            FROM messages m
            LEFT JOIN sessions s ON m.session_id = s.id
            WHERE m.role = 'tool' AND m.observed = 0
            ORDER BY m.id ASC
            LIMIT ?
        `);

        this._prepared.markObserved = db.prepare(`
            UPDATE messages SET observed = 1 WHERE id = ?
        `);

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
     * 轮询一次：读取未处理的 tool 消息，聚合后写入 a-beat.db
     */
    async _pollOnce() {
        this._ensurePrepared();
        const db = this._getDb();
        if (!db || !this._prepared.fetchToolMessages) return;

        try {
            const toolMessages = this._prepared.fetchToolMessages.all(POLL_BATCH_SIZE);
            if (toolMessages.length === 0) return;

            const abeatDb = require('../abeat-db');

            // 按 session 分组
            const bySession = new Map();
            for (const msg of toolMessages) {
                const sid = msg.session_id;
                if (!bySession.has(sid)) bySession.set(sid, []);
                bySession.get(sid).push(msg);
            }

            const observedIds = [];

            for (const [sessionId, messages] of bySession) {
                const cwd = messages[0].cwd || process.cwd();
                const projectKey = this.getProjectKey(cwd);
                const projectName = this.getProjectName(cwd);

                this.updateProjectsFile(projectKey, cwd, projectName);

                // 聚合 session 统计
                let totalDuration = 0;
                let errorCount = 0;
                const toolCounts = {};
                let firstTs = null;
                let lastTs = null;

                for (const msg of messages) {
                    const record = this._buildRecord(msg, sessionId, projectKey, projectName, cwd);
                    if (!record) {
                        observedIds.push(msg.id);
                        continue;
                    }

                    // 累加统计
                    totalDuration += record.duration_ms || 0;
                    if (!record.success) errorCount++;
                    toolCounts[record.tool_name] = (toolCounts[record.tool_name] || 0) + 1;

                    const ts = record.ts || record.timestamp;
                    if (ts) {
                        if (!firstTs || ts < firstTs) firstTs = ts;
                        if (!lastTs || ts > lastTs) lastTs = ts;

                        // 按天统计
                        const date = ts.slice(0, 10);
                        abeatDb.updateDailyStats(date, 'hermes', record.tool_name, 1, record.success ? 0 : 1, record.duration_ms || 0);

                        // 错误记录
                        if (!record.success && record.error) {
                            abeatDb.saveError(ts, sessionId, 'hermes', record.tool_name, record.error);
                        }
                    }

                    observedIds.push(msg.id);
                }

                // 写入 session 摘要（累加 total_duration_ms）
                const existingDuration = abeatDb.getSessionDuration(sessionId);
                abeatDb.upsertSession({
                    session_id: sessionId,
                    project_key: projectKey,
                    source: 'hermes',
                    start_time: firstTs || '',
                    end_time: lastTs || '',
                    tool_count: messages.length,
                    error_count: errorCount,
                    total_duration_ms: existingDuration + totalDuration,
                });
            }

            // 批量标记为已处理
            if (observedIds.length > 0) {
                const markBatch = db.transaction((ids) => {
                    for (const id of ids) {
                        this._prepared.markObserved.run(id);
                    }
                });
                markBatch(observedIds);
            }
        } catch (e) {
            this.logError(e, 'hermes:poll');
        }
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

module.exports = HermesAdapter;
