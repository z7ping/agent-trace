#!/usr/bin/env node
/**
 * PostToolUse hook: 记录工具调用日志（含耗时、调用链）
 * 由 prelog.js (PreToolUse) + log.js (PostToolUse) 配合实现耗时追踪
 *
 * 支持多项目：日志按项目分组存储在 ~/.claude/tooltrace/logs/ 目录下
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 上级目录（tooltrace 根目录）
const BASE_DIR = path.join(__dirname, '..');
const LOGS_DIR = path.join(BASE_DIR, 'logs');
const STATES_DIR = path.join(BASE_DIR, 'states');
const PROJECTS_FILE = path.join(BASE_DIR, 'projects.json');

// 确保目录存在
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}
if (!fs.existsSync(STATES_DIR)) {
    fs.mkdirSync(STATES_DIR, { recursive: true });
}

function getProjectKey(cwd) {
    if (!cwd) cwd = process.cwd();
    return crypto.createHash('md5').update(cwd).digest('hex').substring(0, 12);
}

function getProjectName(cwd) {
    if (!cwd) cwd = process.cwd();
    return path.basename(cwd);
}

function getLogFile(projectKey) {
    return path.join(LOGS_DIR, `${projectKey}.jsonl`);
}

function getStateFile(projectKey) {
    return path.join(STATES_DIR, `${projectKey}.json`);
}

function readState(stateFile) {
    if (fs.existsSync(stateFile)) {
        try {
            const content = fs.readFileSync(stateFile, 'utf-8').trim();
            if (content) {
                return JSON.parse(content);
            }
        } catch (e) {
            // 忽略错误
        }
    }
    return { seq: 0, stack: [] };
}

function writeState(stateFile, state) {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
}

function updateProjectsFile(projectKey, cwd, projectName) {
    let projects = {};
    if (fs.existsSync(PROJECTS_FILE)) {
        try {
            const content = fs.readFileSync(PROJECTS_FILE, 'utf-8').trim();
            if (content) {
                projects = JSON.parse(content);
            }
        } catch (e) {
            projects = {};
        }
    }

    projects[projectKey] = {
        cwd: cwd,
        name: projectName,
        last_seen: new Date().toISOString()
    };

    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf-8');
}

function truncate(obj, maxLen = 200) {
    if (typeof obj === 'string') {
        return obj.length > maxLen ? obj.substring(0, maxLen) + '…' : obj;
    }
    if (Array.isArray(obj)) {
        return obj.slice(0, 10).map(item => truncate(item, maxLen));
    }
    if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = truncate(value, maxLen);
        }
        return result;
    }
    return obj;
}

function summarizeInput(toolName, toolInput) {
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

function extractError(response) {
    if (typeof response === 'string') {
        return response.trim() ? response.substring(0, 300) : null;
    }
    if (response && typeof response === 'object') {
        for (const key of ['error', 'message', 'stderr', 'errorMessage', 'error_message']) {
            const val = response[key];
            if (val) {
                const str = String(val);
                if (str && str !== 'None' && str !== 'false' && str !== 'True') {
                    return str.substring(0, 300);
                }
            }
        }
        return null;
    }
    if (Array.isArray(response)) {
        for (const item of response) {
            if (item && typeof item === 'object') {
                const err = extractError(item);
                if (err) return err;
            }
        }
    }
    return null;
}

function popFromStack(state, toolName) {
    for (let i = state.stack.length - 1; i >= 0; i--) {
        if (state.stack[i].tool_name === toolName) {
            return state.stack.splice(i, 1)[0];
        }
    }
    return null;
}

function processRecord(data) {
    if (!data || typeof data !== 'object') return;

    // 从数据中获取 cwd
    const cwd = data.cwd || data.working_directory || process.cwd();
    const projectKey = getProjectKey(cwd);
    const projectName = getProjectName(cwd);

    // 更新项目列表
    updateProjectsFile(projectKey, cwd, projectName);

    let response = data.tool_response;
    if (Array.isArray(response)) {
        response = response[0] || {};
    }

    // 判断成功/失败
    const toolName = data.tool_name || '';
    let success = true;
    let errorMsg = null;

    if (response && typeof response === 'object') {
        success = response.success !== false;
        const exitCode = response.exit_code;
        if (exitCode !== null && exitCode !== undefined && exitCode !== 0) {
            success = false;
        }
        if (!success) {
            errorMsg = response.stderr || response.error || extractError(response);
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

    // 读取调用栈，计算耗时和调用链
    let durationMs = data.duration_ms;
    let parentSeq = null;
    let callSeq = null;

    if (toolName) {
        const stateFile = getStateFile(projectKey);
        const state = readState(stateFile);
        const preEntry = popFromStack(state, toolName);

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

        writeState(stateFile, state);
    }

    // 组装记录
    const record = {
        ts: new Date().toISOString(),
        session_id: data.session_id || '',
        project_key: projectKey,
        project_name: projectName,
        tool_name: toolName,
        input_summary: summarizeInput(toolName, data.tool_input || {}),
        success: success,
    };

    // 加入调用链元数据
    if (callSeq !== null) {
        record.seq = callSeq;
    }
    if (parentSeq !== null) {
        record.parent_seq = parentSeq;
    }
    if (durationMs !== null && durationMs !== undefined) {
        record.duration_ms = durationMs;
    }

    // 写入错误信息
    if (!success && errorMsg) {
        record.error = errorMsg.substring(0, 500).trim();
    }

    // 写入项目对应的日志文件
    const logFile = getLogFile(projectKey);
    fs.appendFileSync(logFile, JSON.stringify(record) + '\n', 'utf-8');
}

function main() {
    let input = '';

    process.stdin.setEncoding('utf-8');

    process.stdin.on('data', (chunk) => {
        input += chunk;
    });

    process.stdin.on('end', () => {
        try {
            if (!input.trim()) return;

            const data = JSON.parse(input);

            if (Array.isArray(data)) {
                data.forEach(item => processRecord(item));
            } else {
                processRecord(data);
            }
        } catch (e) {
            // 记录错误日志
            try {
                const errorLog = path.join(BASE_DIR, 'trace_error.log');
                const timestamp = new Date().toISOString();
                fs.appendFileSync(errorLog, `[${timestamp}] ${e.message}\n${e.stack}\n`, 'utf-8');
            } catch (logError) {
                // 忽略日志错误
            }
        }
    });
}

main();
