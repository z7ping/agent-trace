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
const POLL_INTERVAL_MS = 5000;

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
     * 轮询一次：读取未处理的 tool 消息，转换并写入日志
     */
    async _pollOnce() {
        this._ensurePrepared();
        const db = this._getDb();
        if (!db || !this._prepared.fetchToolMessages) return;

        try {
            const toolMessages = this._prepared.fetchToolMessages.all();
            if (toolMessages.length === 0) return;

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

                for (const msg of messages) {
                    const record = this._buildRecord(msg, sessionId, projectKey, projectName, cwd);
                    if (!record) {
                        observedIds.push(msg.id);
                        continue;
                    }

                    // 写入 SQLite（优先）或 JSONL（回退）
                    try {
                        const trackerDb = require('../tracker-db');
                        trackerDb.writeToolCall(record);
                    } catch (_) {
                        // 回退到 JSONL
                        const logFile = this.getLogFile(projectKey);
                        fs.appendFileSync(logFile, JSON.stringify(record) + '\n', 'utf-8');
                    }
                    observedIds.push(msg.id);
                }
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

        if (msg.tool_call_id) {
            const likePattern = `%${msg.tool_call_id}%`;
            const assistant = this._prepared.findAssistantByToolCallId.get(likePattern);

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
        if (msg.tool_call_id) {
            const likePattern = `%${msg.tool_call_id}%`;
            const assistant = this._prepared.findAssistantByToolCallId.get(likePattern);
            if (assistant) {
                durationMs = Math.round((msg.timestamp - assistant.timestamp) * 1000) / 1000;
            }
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

module.exports = HermesAdapter;
