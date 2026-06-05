#!/usr/bin/env node
/**
 * PreToolUse hook: 记录工具调用开始时间和调用栈
 * 与 log.js (PostToolUse) 配合计算耗时和父子调用关系
 *
 * 支持多项目：状态文件按项目分组存储在 ~/.claude/tooltrace/states/ 目录下
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 上级目录（tooltrace 根目录）
const BASE_DIR = path.join(__dirname, '..');
const STATES_DIR = path.join(BASE_DIR, 'states');

// 确保目录存在
if (!fs.existsSync(STATES_DIR)) {
    fs.mkdirSync(STATES_DIR, { recursive: true });
}

function getProjectKey(cwd) {
    if (!cwd) cwd = process.cwd();
    return crypto.createHash('md5').update(cwd).digest('hex').substring(0, 12);
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

function process(data) {
    if (!data || typeof data !== 'object') return;

    const toolName = data.tool_name;
    if (!toolName) return;

    // 从数据中获取 cwd
    const cwd = data.cwd || data.working_directory || process.cwd();
    const projectKey = getProjectKey(cwd);
    const stateFile = getStateFile(projectKey);

    // 读取当前状态
    const state = readState(stateFile);
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

    writeState(stateFile, state);
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
                data.forEach(item => process(item));
            } else {
                process(data);
            }
        } catch (e) {
            // 静默失败，不影响 Claude Code 正常工作
        }
    });
}

main();
