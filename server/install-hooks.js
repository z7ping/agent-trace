#!/usr/bin/env node
/**
 * install-hooks.js - 更新所有支持工具的 hooks 配置
 * 覆盖：Claude Code (~/.claude/settings.json)、Codex (~/.codex/hooks.json)、Cursor (~/.cursor/hooks.json)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const TOOL_TRACKER_DIR = path.join(HOME, '.agent-trace');
const PRELOG_PATH = path.join(TOOL_TRACKER_DIR, 'hooks', 'prelog.js').replace(/\\/g, '/');
const LOG_PATH = path.join(TOOL_TRACKER_DIR, 'hooks', 'log.js').replace(/\\/g, '/');

const MARKER = 'agent-trace';

// ─── 工具函数 ────────────────────────────────────────────

function readJson(filePath) {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (_) {}
    return {};
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function removeOldHooks(hookArray, marker = MARKER) {
    if (!Array.isArray(hookArray)) return [];
    return hookArray.filter(entry => {
        if (!entry || !entry.hooks) return true;
        return !entry.hooks.some(h => h.command && h.command.includes(marker));
    });
}

function makeHookEntry(command, timeout = 5) {
    return {
        hooks: [{ command, type: 'command', timeout, statusMessage: '', async: false }]
    };
}

// ─── 1. Claude Code ──────────────────────────────────────

function installClaudeCode() {
    const settingsFile = path.join(HOME, '.claude', 'settings.json');
    const settings = readJson(settingsFile);
    if (!settings.hooks) settings.hooks = {};

    // 清理旧的 agent-beat hooks
    settings.hooks.PreToolUse = removeOldHooks(settings.hooks.PreToolUse, 'agent-beat');
    settings.hooks.PostToolUse = removeOldHooks(settings.hooks.PostToolUse, 'agent-beat');
    // 清理旧的 agent-trace hooks
    settings.hooks.PreToolUse = removeOldHooks(settings.hooks.PreToolUse, MARKER);
    settings.hooks.PostToolUse = removeOldHooks(settings.hooks.PostToolUse, MARKER);

    settings.hooks.PreToolUse.push(makeHookEntry(`node ${PRELOG_PATH}`, 5));
    settings.hooks.PostToolUse.push(makeHookEntry(`node ${LOG_PATH}`, 10));

    writeJson(settingsFile, settings);
    console.log('   [OK] Claude Code settings.json 已更新');
}

// ─── 2. Codex ────────────────────────────────────────────

function installCodex() {
    const hooksFile = path.join(HOME, '.codex', 'hooks.json');
    const hooks = readJson(hooksFile);
    if (!hooks.hooks) hooks.hooks = {};

    // 清理旧的 agent-beat / agent-trace hooks
    hooks.hooks.PreToolUse = removeOldHooks(hooks.hooks.PreToolUse, 'agent-beat');
    hooks.hooks.PostToolUse = removeOldHooks(hooks.hooks.PostToolUse, 'agent-beat');
    hooks.hooks.PreToolUse = removeOldHooks(hooks.hooks.PreToolUse, MARKER);
    hooks.hooks.PostToolUse = removeOldHooks(hooks.hooks.PostToolUse, MARKER);

    hooks.hooks.PreToolUse.push(makeHookEntry(`node ${PRELOG_PATH}`, 5));
    hooks.hooks.PostToolUse.push(makeHookEntry(`node ${LOG_PATH}`, 10));

    writeJson(hooksFile, hooks);
    console.log('   [OK] Codex hooks.json 已更新');
}

// ─── 3. Cursor ───────────────────────────────────────────

function installCursor() {
    const hooksFile = path.join(HOME, '.cursor', 'hooks.json');
    const hooks = readJson(hooksFile);
    if (!hooks.hooks) hooks.hooks = {};

    // 清理旧的 agent-beat / agent-trace hooks
    hooks.hooks.PreToolUse = removeOldHooks(hooks.hooks.PreToolUse, 'agent-beat');
    hooks.hooks.PostToolUse = removeOldHooks(hooks.hooks.PostToolUse, 'agent-beat');
    hooks.hooks.PreToolUse = removeOldHooks(hooks.hooks.PreToolUse, MARKER);
    hooks.hooks.PostToolUse = removeOldHooks(hooks.hooks.PostToolUse, MARKER);

    hooks.hooks.PreToolUse.push(makeHookEntry(`node ${PRELOG_PATH}`, 5));
    hooks.hooks.PostToolUse.push(makeHookEntry(`node ${LOG_PATH}`, 10));

    writeJson(hooksFile, hooks);
    console.log('   [OK] Cursor hooks.json 已更新');
}

// ─── 执行 ────────────────────────────────────────────────

console.log('   安装 hooks 到所有支持的工具...');
installClaudeCode();
installCodex();
installCursor();
console.log('   [OK] 全部完成');
