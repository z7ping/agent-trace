#!/usr/bin/env node
/**
 * PreToolUse hook: 记录工具调用开始时间和调用栈
 * 与 log.js (PostToolUse) 配合计算耗时和父子调用关系
 *
 * 委托给适配器处理具体逻辑，本文件负责：
 * 1. 自动拉起 HTTP 服务
 * 2. 读取 stdin
 * 3. 分发给默认适配器的 pre() 方法
 */

const path = require('path');
const { getDefaultAdapter } = require('../adapters');

// 上级目录（tooltrace 根目录）
const BASE_DIR = path.join(__dirname, '..');

const adapter = getDefaultAdapter();

function logError(e) {
    try {
        const fs = require('fs');
        const logFile = require('path').join(BASE_DIR, 'trace_error.log');
        const msg = `[${new Date().toISOString()}] PreToolUse prelog.js: ${e.message || e}\n`;
        fs.appendFileSync(logFile, msg, 'utf-8');
    } catch (_) {
        // 写日志本身失败时静默
    }
}

function main() {
    // ─── 自动拉起 HTTP 服务（非阻塞）─────────────────────────
    try {
        const guard = require('./server-guard');
        guard.ensureServerRunning(BASE_DIR, 37215);
    } catch (_) {}
    // ─────────────────────────────────────────────────────────

    try {
        const chunks = [];
        process.stdin.on('data', (chunk) => chunks.push(chunk));
        process.stdin.on('end', () => {
            try {
                const input = Buffer.concat(chunks).toString('utf-8');
                if (!input.trim()) return;

                const data = JSON.parse(input);

                if (Array.isArray(data)) {
                    data.forEach(item => adapter.pre(item));
                } else {
                    adapter.pre(data);
                }
            } catch (e) {
                logError(e);
            }
        });
        process.stdin.on('error', (e) => {
            logError(e);
        });
    } catch (e) {
        logError(e);
    }
}

main();
