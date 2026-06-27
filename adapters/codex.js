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

    // ─── PreToolUse ────────────────────────────────────────

    /**
     * 处理 PreToolUse 事件：记录工具调用开始时间和调用栈
     * @param {Object} data - 从 stdin 读取的 JSON 数据
     */
    async pre(data) {
        if (!data || typeof data !== 'object') return;

        const toolName = data.tool_name || data.name || data.tool;
        if (!toolName) return;

        const cwd = data.cwd || data.working_directory || data.workdir || process.cwd();
        const projectKey = this.getProjectKey(cwd);
        const stateFile = this.getStateFile(projectKey);

        // 读取当前状态
        const state = this.readState(stateFile);
        state.seq += 1;
        const seq = state.seq;

        // 记录父调用（栈顶元素的 seq）
        const parentSeq = state.stack.length > 0 ? state.stack[state.stack.length - 1].seq : null;

        const entry = {
            seq: seq,
            tool_name: toolName,
            ts_start: new Date().toISOString(),
            parent_seq: parentSeq,
            cwd: cwd
        };
        state.stack.push(entry);

        this.writeState(stateFile, state);
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
        } else if (typeof response === 'string') {
            const respText = response.trim();
            if (respText) {
                const errorPatterns = [
                    'Traceback (most recent call last)',
                    'Error:', 'ERROR:', 'FATAL:',
                    'SyntaxError:', 'FileNotFoundError:', 'Permission denied',
                    'No such file or directory', 'command not found', 'fatal:',
                ];
                if (errorPatterns.some(p => respText.includes(p))) {
                    success = false;
                    errorMsg = respText.substring(0, 300);
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
            const preEntry = this.popFromStack(state, toolName);

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
