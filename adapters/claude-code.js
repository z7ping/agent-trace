#!/usr/bin/env node
/**
 * Claude Code 适配器
 * 复用现有 hooks/prelog.js + hooks/log.js 的核心逻辑
 * 支持 JSONL 轮询聚合到 a-beat.db
 */

const fs = require('fs');
const path = require('path');
const BaseAdapter = require('./base');

const BASE_DIR = path.join(__dirname, '..');
const LOGS_DIR = path.join(BASE_DIR, 'logs');
// 可配置：轮询间隔（毫秒），默认 30 分钟
const POLL_INTERVAL_MS = parseInt(process.env.CLAUDE_CODE_POLL_INTERVAL_MS, 10) || 30 * 60 * 1000;
// 轮询状态文件：记录每个 JSONL 文件已处理的行数
const POLL_STATE_FILE = path.join(BASE_DIR, 'states', 'claude-code-poll-state.json');

class ClaudeCodeAdapter extends BaseAdapter {
    constructor() {
        super();
        this._db = null;
        this._pollTimer = null;
    }

    get name() {
        return 'claude-code';
    }

    // ─── PostToolUse ───────────────────────────────────────

    /**
     * 摘要化工具输入
     * @param {string} toolName
     * @param {Object} toolInput
     * @returns {Object}
     */
    summarizeInput(toolName, toolInput) {
        if (!toolInput || typeof toolInput !== 'object') return {};

        const summary = {};

        if (toolName === 'Bash') {
            const cmd = String(toolInput.command || '');
            summary.command = cmd.length > 120 ? cmd.substring(0, 120) + '…' : cmd;
            summary.description = toolInput.description || '';
        } else if (['Read', 'Write', 'Edit', 'Glob', 'Grep'].includes(toolName)) {
            summary.file_path = toolInput.file_path || '';
            if (toolName === 'Edit') {
                summary.old_len = (toolInput.old_string || '').length;
                summary.new_len = (toolInput.new_string || '').length;
            } else if (toolName === 'Grep') {
                summary.pattern = toolInput.pattern || '';
                summary.output_mode = toolInput.output_mode || '';
            } else if (toolName === 'Glob') {
                summary.pattern = toolInput.pattern || '';
            }
        } else if (toolName === 'Skill') {
            summary.skill = toolInput.skill || '';
            if (toolInput.args) {
                const args = String(toolInput.args);
                summary.args = args.length > 100 ? args.substring(0, 100) + '…' : args;
            }
        } else if (toolName === 'Agent') {
            summary.description = toolInput.description || '';
            summary.agent_type = toolInput.agentType || '';
        } else if (toolName.startsWith('mcp__')) {
            const parts = toolName.split('__');
            summary.mcp_server = parts.length > 2 ? parts[1] : '';
            summary.tool = parts.length > 2 ? parts[parts.length - 1] : toolName;
            for (const key of ['query', 'symbol', 'pattern', 'prompt', 'path', 'question']) {
                if (key in toolInput) {
                    const val = String(toolInput[key]);
                    summary[key] = val.length > 100 ? val.substring(0, 100) + '…' : val;
                }
            }
        } else {
            summary.keys = Object.keys(toolInput).slice(0, 8);
        }

        return summary;
    }

    /**
     * 处理 PostToolUse 事件：记录工具调用日志
     * @param {Object} data - 从 stdin 读取的 JSON 数据
     */
    async post(data) {
        if (!data || typeof data !== 'object') return;

        const cwd = data.cwd || data.working_directory || process.cwd();
        const projectKey = this.getProjectKey(cwd);
        const projectName = this.getProjectName(cwd);

        // 更新项目列表
        this.updateProjectsFile(projectKey, cwd, projectName);

        let response = data.tool_response;
        if (Array.isArray(response)) {
            response = response[0] || {};
        }

        const toolName = data.tool_name || '';
        const { success, error: errorMsg } = this.judgeSuccess(response);

        // 读取调用栈，计算耗时和调用链
        let durationMs = data.duration_ms;
        let parentSeq = null;
        let callSeq = null;

        if (toolName) {
            const stateFile = this.getStateFile(projectKey);
            const state = this.readState(stateFile);
            const preEntry = this.popFromStack(state);

            if (preEntry) {
                callSeq = preEntry.seq;
                parentSeq = preEntry.parent_seq;

                if (durationMs === null || durationMs === undefined) {
                    try {
                        const tsStart = new Date(preEntry.ts_start);
                        const tsNow = new Date();
                        durationMs = Math.round((tsNow - tsStart) * 1000) / 1000;
                    } catch (e) {
                        // 忽略错误
                    }
                }
            }

            this.writeState(stateFile, state);
        }

        // 组装记录
        const record = {
            ts: new Date().toISOString(),
            session_id: data.session_id || '',
            project_key: projectKey,
            project_name: projectName,
            tool_name: toolName,
            source: this.name,
            input_summary: this.summarizeInput(toolName, data.tool_input || {}),
            success: success,
        };

        if (callSeq !== null) {
            record.seq = callSeq;
        }
        if (parentSeq !== null) {
            record.parent_seq = parentSeq;
        }
        if (durationMs !== null && durationMs !== undefined) {
            record.duration_ms = durationMs;
        }
        if (!success && errorMsg) {
            record.error = errorMsg.substring(0, 500).trim();
        }

        // 写入 JSONL 日志
        const logFile = this.getLogFile(projectKey);
        fs.appendFileSync(logFile, JSON.stringify(record) + '\n', 'utf-8');

        // 双写 SQLite（如果数据库存在）
        this._writeToSqlite(data, record, projectKey, projectName, cwd, toolName, callSeq, parentSeq, durationMs, success);
    }

    /**
     * 双写 SQLite 数据库（单例连接 + try/finally）
     * @private
     */
    _writeToSqlite(data, record, projectKey, projectName, cwd, toolName, callSeq, parentSeq, durationMs, success) {
        const dbFile = path.join(BASE_DIR, 'tracker.db');
        if (!fs.existsSync(dbFile)) return;

        let Database;
        try {
            Database = require('better-sqlite3');
        } catch (_) {
            return; // better-sqlite3 未安装则跳过
        }

        // 单例连接
        if (!this._db) {
            try {
                this._db = new Database(dbFile);
            } catch (_) {
                return;
            }
        }

        try {
            const upsertProject = this._db.prepare(`
                INSERT OR IGNORE INTO projects (project_key, name, cwd, last_seen)
                VALUES (?, ?, ?, ?)
            `);
            upsertProject.run(projectKey, projectName, cwd, new Date().toISOString());

            this._db.prepare('UPDATE projects SET last_seen = ? WHERE project_key = ?')
                .run(new Date().toISOString(), projectKey);

            if (data.session_id) {
                const upsertSession = this._db.prepare(`
                    INSERT OR IGNORE INTO sessions (session_id, project_key, start_time, tool_count)
                    VALUES (?, ?, ?, 0)
                `);
                upsertSession.run(data.session_id, projectKey, new Date().toISOString());

                this._db.prepare('UPDATE sessions SET tool_count = tool_count + 1 WHERE session_id = ?')
                    .run(data.session_id);
            }

            const insertCall = this._db.prepare(`
                INSERT INTO tool_calls (ts, session_id, project_key, tool_name, input_summary, success, seq, parent_seq, duration_ms, error)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            insertCall.run(
                record.ts,
                data.session_id || '',
                projectKey,
                toolName,
                JSON.stringify(record.input_summary),
                success ? 1 : 0,
                callSeq || null,
                parentSeq || null,
                durationMs || null,
                record.error || null
            );
        } catch (e) {
            try {
                const errorLog = path.join(BASE_DIR, 'trace_error.log');
                const timestamp = new Date().toISOString();
                fs.appendFileSync(errorLog, `[${timestamp}] SQLite error: ${e.message}\n`, 'utf-8');
            } catch (_) {}
        } finally {
            // 连接保持复用，不关闭
        }
    }

    // ─── JSONL 轮询聚合 ──────────────────────────────────

    /**
     * 读取轮询状态（每个文件已处理的行数）
     * @returns {Object} { [filename]: processedLineCount }
     */
    _readPollState() {
        try {
            if (fs.existsSync(POLL_STATE_FILE)) {
                return JSON.parse(fs.readFileSync(POLL_STATE_FILE, 'utf-8'));
            }
        } catch (_) {}
        return {};
    }

    /**
     * 写入轮询状态
     * @param {Object} state
     */
    _writePollState(state) {
        try {
            const dir = path.dirname(POLL_STATE_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(POLL_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
        } catch (_) {}
    }

    /**
     * 轮询一次：扫描 JSONL 文件，聚合新记录到 a-beat.db
     */
    async _pollOnce() {
        if (!fs.existsSync(LOGS_DIR)) return;

        try {
            const abeatDb = require('../abeat-db');
            const pollState = this._readPollState();
            const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.jsonl'));

            for (const file of files) {
                const logFile = path.join(LOGS_DIR, file);
                const content = fs.readFileSync(logFile, 'utf-8');
                const lines = content.split('\n').filter(l => l.trim());
                const totalLines = lines.length;
                const processed = pollState[file] || 0;

                if (processed >= totalLines) continue;

                // 只处理新增行
                const newLines = lines.slice(processed);
                const bySession = new Map();

                for (const line of newLines) {
                    try {
                        const record = JSON.parse(line);
                        // 只聚合 claude-code 来源的记录
                        if (record.source && record.source !== 'claude-code') continue;
                        if (!record.session_id) continue;

                        if (!bySession.has(record.session_id)) {
                            bySession.set(record.session_id, []);
                        }
                        bySession.get(record.session_id).push(record);
                    } catch (_) {}
                }

                for (const [sessionId, records] of bySession) {
                    let totalDuration = 0;
                    let errorCount = 0;
                    let firstTs = null;
                    let lastTs = null;

                    for (const record of records) {
                        totalDuration += record.duration_ms || 0;
                        if (!record.success) errorCount++;

                        const ts = record.ts || '';
                        if (ts) {
                            if (!firstTs || ts < firstTs) firstTs = ts;
                            if (!lastTs || ts > lastTs) lastTs = ts;

                            // 按天统计
                            const date = ts.slice(0, 10);
                            abeatDb.updateDailyStats(date, 'claude-code', record.tool_name, 1, record.success ? 0 : 1, record.duration_ms || 0);

                            // 错误记录
                            if (!record.success && record.error) {
                                abeatDb.saveError(ts, sessionId, 'claude-code', record.tool_name, record.error);
                            }
                        }
                    }

                    // session 摘要（累加 total_duration_ms）
                    const projectKey = records[0].project_key || '';
                    const existingDuration = abeatDb.getSessionDuration(sessionId);
                    abeatDb.upsertSession({
                        session_id: sessionId,
                        project_key: projectKey,
                        source: 'claude-code',
                        start_time: firstTs || '',
                        end_time: lastTs || '',
                        tool_count: records.length,
                        error_count: errorCount,
                        total_duration_ms: existingDuration + totalDuration,
                    });
                }

                pollState[file] = totalLines;
            }

            this._writePollState(pollState);
        } catch (e) {
            this.logError(e, 'claude-code:poll');
        }
    }

    /**
     * 启动 JSONL 轮询
     * @param {number} intervalMs - 轮询间隔（毫秒）
     */
    startPolling(intervalMs = POLL_INTERVAL_MS) {
        if (this._pollTimer) return;

        // 立即执行一次
        this._pollOnce();

        this._pollTimer = setInterval(() => this._pollOnce(), intervalMs);
    }

    /**
     * 停止轮询
     */
    stopPolling() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
    }
}

module.exports = ClaudeCodeAdapter;
