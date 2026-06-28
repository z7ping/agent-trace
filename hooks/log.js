#!/usr/bin/env node
/**
 * PostToolUse hook: 记录工具调用日志（含耗时、调用链）
 * 由 prelog.js (PreToolUse) + log.js (PostToolUse) 配合实现耗时追踪
 *
 * 委托给适配器处理具体逻辑，本文件负责：
 * 1. 读取 stdin
 * 2. 分发给默认适配器的 post() 方法
 */

const path = require('path');
const fs = require('fs');
const { getDefaultAdapter } = require('../adapters');

// 上级目录（agent-beat 根目录）
const BASE_DIR = path.join(__dirname, '..');

const adapter = getDefaultAdapter();

function main() {
    try {
        const chunks = [];
        process.stdin.on('data', (chunk) => chunks.push(chunk));
        process.stdin.on('end', async () => {
            try {
                const input = Buffer.concat(chunks).toString('utf-8');
                if (!input.trim()) return;

                const data = JSON.parse(input);

                // 诊断：记录收到的 tool_name
                const toolName = data.tool_name || data.name || '(empty)';
                try {
                    const logFile = path.join(BASE_DIR, 'trace_post.log');
                    fs.appendFileSync(logFile, `[${new Date().toISOString()}] post: tool=${toolName}\n`, 'utf-8');
                } catch (_) {}

                if (Array.isArray(data)) {
                    for (const item of data) {
                        await adapter.post(item);
                    }
                } else {
                    await adapter.post(data);
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
        process.stdin.on('error', (e) => {
            try {
                const errorLog = path.join(BASE_DIR, 'trace_error.log');
                const timestamp = new Date().toISOString();
                fs.appendFileSync(errorLog, `[${timestamp}] stdin error: ${e.message}\n`, 'utf-8');
            } catch (_) {}
        });
    } catch (e) {
        // 静默失败
    }
}

main();
