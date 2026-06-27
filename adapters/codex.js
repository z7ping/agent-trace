#!/usr/bin/env node
/**
 * Codex 适配器
 * 通过 ~/.codex/hooks.json 配置 PreToolUse/PostToolUse 钩子
 * 从 stdin 接收 JSON 数据，转换为统一格式
 */

const fs = require('fs');
const path = require('path');
const BaseAdapter = require('./base');

const HOME_DIR = require('os').homedir();
const CODEX_DIR = path.join(HOME_DIR, '.codex');

class CodexAdapter extends BaseAdapter {
    get name() {
        return 'codex';
    }

    // pre() 继承自 base.js，覆盖 tool_name 字段名
    async pre(data) {
        return super.pre(data, { toolNameField: 'tool_name', cwdFields: ['cwd', 'working_directory', 'workdir'] });
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

        if (toolName === 'shell' || toolName === 'bash' || toolName === 'terminal') {
            const cmd = String(toolInput.command || toolInput.cmd || '');
            summary.command = cmd.length > 120 ? cmd.substring(0, 120) + '…' : cmd;
            summary.description = toolInput.description || '';
        } else if (['read', 'write', 'edit', 'file_read', 'file_write', 'file_edit'].includes(toolName)) {
            summary.file_path = toolInput.file_path || toolInput.path || '';
            if (['edit', 'file_edit'].includes(toolName)) {
                summary.old_len = (toolInput.old_string || toolInput.old || '').length;
                summary.new_len = (toolInput.new_string || toolInput.new || '').length;
            }
        } else if (toolName === 'web_search' || toolName === 'search') {
            summary.query = String(toolInput.query || toolInput.search || '').substring(0, 100);
        } else if (toolName === 'computer' || toolName === 'browser') {
            summary.action = toolInput.action || '';
            if (toolInput.url) {
                summary.url = String(toolInput.url).substring(0, 100);
            }
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
     * 判断工具调用是否成功
     * @param {*} response
     * @returns {{ success: boolean, error: string|null }}
     */
    judgeSuccess(response) {
        let success = true;
        let errorMsg = null;

        if (response && typeof response === 'object') {
            success = response.success !== false;
            const exitCode = response.exit_code ?? response.exitCode;
            if (exitCode !== null && exitCode !== undefined && exitCode !== 0) {
                success = false;
            }
            if (!success) {
                errorMsg = response.stderr || response.error || response.output || this.extractError(response);
                if (exitCode !== null && exitCode !== undefined && exitCode !== 0) {
                    errorMsg = `Exit code ${exitCode}` + (errorMsg ? `: ${errorMsg}` : '');
                }
            }
        }

        return { success, error: errorMsg };
    }

    /**
     * 处理 PostToolUse 事件：记录工具调用日志
     * @param {Object} data - 从 stdin 读取的 JSON 数据
     */
    async post(data) {
        if (!data || typeof data !== 'object') return;

        const cwd = data.cwd || data.working_directory || data.workdir || process.cwd();
        const projectKey = this.getProjectKey(cwd);
        const projectName = this.getProjectName(cwd);

        // 更新项目列表
        this.updateProjectsFile(projectKey, cwd, projectName);

        let response = data.tool_response || data.output || data.result;
        if (Array.isArray(response)) {
            response = response[0] || {};
        }

        const toolName = data.tool_name || data.name || data.tool || '';
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
            session_id: data.session_id || data.conversation_id || '',
            project_key: projectKey,
            project_name: projectName,
            tool_name: toolName,
            source: this.name,
            input_summary: this.summarizeInput(toolName, data.tool_input || data.input || {}),
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

        // 双写 SQLite
        this._writeToSqlite(data, record, projectKey, projectName, cwd, toolName, callSeq, parentSeq, durationMs, success);
    }

    _writeToSqlite(data, record, projectKey, projectName, cwd, toolName, callSeq, parentSeq, durationMs, success) {
        const dbFile = require('path').join(require('./base').BASE_DIR || require('path').join(__dirname, '..'), 'tracker.db');
        if (!require('fs').existsSync(dbFile)) return;
        let Database;
        try { Database = require('better-sqlite3'); } catch (_) { return; }
        if (!this._db) {
            try { this._db = new Database(dbFile); } catch (_) { return; }
        }
        try {
            this._db.prepare('INSERT OR IGNORE INTO projects (project_key, name, cwd, last_seen) VALUES (?, ?, ?, ?)').run(projectKey, projectName, cwd, new Date().toISOString());
            this._db.prepare('UPDATE projects SET last_seen = ? WHERE project_key = ?').run(new Date().toISOString(), projectKey);
            if (data.session_id) {
                this._db.prepare('INSERT OR IGNORE INTO sessions (session_id, project_key, start_time, tool_count) VALUES (?, ?, ?, 0)').run(data.session_id, projectKey, new Date().toISOString());
                this._db.prepare('UPDATE sessions SET tool_count = tool_count + 1 WHERE session_id = ?').run(data.session_id);
            }
            this._db.prepare('INSERT INTO tool_calls (ts, session_id, project_key, tool_name, input_summary, success, seq, parent_seq, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(record.ts, data.session_id || '', projectKey, toolName, JSON.stringify(record.input_summary), success ? 1 : 0, callSeq || null, parentSeq || null, durationMs || null, record.error || null);
        } catch (e) { try { require('fs').appendFileSync(require('path').join(require('./base').BASE_DIR || require('path').join(__dirname, '..'), 'trace_error.log'), '[' + new Date().toISOString() + '] SQLite error: ' + e.message + '\n'); } catch (_) {} }
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
                    } catch (e) {
                        // 跳过无效行
                    }
                }
            }
        } else {
            // 遍历所有项目
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
                        } catch (e) {
                            // 跳过无效行
                        }
                    }
                }
            }
        }

        return records.slice(-limit);
    }
}

module.exports = CodexAdapter;
