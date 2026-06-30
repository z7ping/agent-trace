#!/usr/bin/env node
/**
 * 适配器注册表
 * 管理所有已注册的适配器，提供统一的获取接口
 */

const ClaudeCodeAdapter = require('./claude-code');
const HermesAdapter = require('./hermes');
const CodexAdapter = require('./codex');
const OpenCodeAdapter = require('./opencode');
const OpenClawAdapter = require('./openclaw');
const CursorAdapter = require('./cursor');
const PiAdapter = require('./pi');

// ─── 适配器注册 ──────────────────────────────────────────

const adapters = new Map();

// 注册内置适配器
adapters.set('claude-code', new ClaudeCodeAdapter());
adapters.set('hermes', new HermesAdapter());
adapters.set('codex', new CodexAdapter());
adapters.set('opencode', new OpenCodeAdapter());
adapters.set('openclaw', new OpenClawAdapter());
adapters.set('cursor', new CursorAdapter());
adapters.set('pi', new PiAdapter());

// 未来适配器在这里注册：

// ─── 公开 API ────────────────────────────────────────────

/**
 * 获取指定名称的适配器
 * @param {string} name - 适配器名称
 * @returns {import('./base')|undefined}
 */
function getAdapter(name) {
    return adapters.get(name);
}

/**
 * 获取默认适配器（claude-code）
 * @returns {import('./claude-code')}
 */
function getDefaultAdapter() {
    return adapters.get('claude-code');
}

/**
 * 获取所有已注册的适配器
 * @returns {Map<string, import('./base')>}
 */
function getAllAdapters() {
    return adapters;
}

/**
 * 注册新适配器
 * @param {string} name
 * @param {import('./base')} adapter
 */
function registerAdapter(name, adapter) {
    adapters.set(name, adapter);
}

/**
 * 获取所有适配器名称
 * @returns {string[]}
 */
function listAdapterNames() {
    return Array.from(adapters.keys());
}

/**
 * 停止所有适配器（轮询 + 关闭数据库连接）
 */
function stopAll() {
    for (const adapter of adapters.values()) {
        if (typeof adapter.stopPolling === 'function') {
            try { adapter.stopPolling(); } catch (_) {}
        }
    }
}

module.exports = {
    getAdapter,
    getDefaultAdapter,
    getAllAdapters,
    registerAdapter,
    listAdapterNames,
    stopAll,
    // 同时导出类以便外部使用
    BaseAdapter: require('./base'),
    ClaudeCodeAdapter,
    HermesAdapter,
    CodexAdapter,
    OpenCodeAdapter,
    OpenClawAdapter,
    CursorAdapter,
};
