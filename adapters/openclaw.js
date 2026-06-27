#!/usr/bin/env node
/**
 * OpenClaw 适配器
 * TODO: 轮询或钩入 OpenClaw 的工具调用记录，转换为统一格式
 * TODO: 确定数据源（数据库路径、日志文件或 API 端点）
 */

const BaseAdapter = require('./base');

class OpenClawAdapter extends BaseAdapter {
    constructor() {
        super();
        // TODO: 初始化数据库连接或轮询状态
        this._pollTimer = null;
    }

    get name() {
        return 'openclaw';
    }

    // ─── PreToolUse ────────────────────────────────────────

    /**
     * 处理 PreToolUse 事件
     * @param {Object} data - 从 stdin 读取的 JSON 数据
     * TODO: 解析 OpenClaw 格式的 pre 事件数据
     */
    async pre(data) {
        // TODO: 实现 PreToolUse 钩子逻辑
        // 参考 claude-code 适配器的 pre() 实现
    }

    // ─── PostToolUse ───────────────────────────────────────

    /**
     * 处理 PostToolUse 事件
     * @param {Object} data - 从 stdin 读取的 JSON 数据
     * TODO: 解析 OpenClaw 格式的 post 事件数据
     */
    async post(data) {
        // TODO: 实现 PostToolUse 钩子逻辑
        // 参考 claude-code 适配器的 post() 实现
    }

    // ─── getRecords ────────────────────────────────────────

    /**
     * 获取工具调用记录
     * @param {Object} filter - 过滤条件
     * @param {string} filter.project_key
     * @param {string} filter.session_id
     * @param {number} filter.limit
     * @returns {Array} 统一格式的调用记录
     * TODO: 实现从 OpenClaw 数据源读取记录
     */
    async getRecords(filter = {}) {
        const { project_key, session_id, limit = 100 } = filter;
        // TODO: 从 OpenClaw 数据源查询并转换记录
        // 参考 opencode 适配器的 getRecords() 实现
        return [];
    }

    // ─── 轮询模式（如需要） ─────────────────────────────────

    /**
     * 启动轮询（如果 OpenClaw 需要定时轮询）
     * @param {number} intervalMs
     * TODO: 根据 OpenClaw 数据源决定是否需要轮询模式
     */
    startPolling(intervalMs = 5000) {
        // TODO: 实现轮询逻辑（参考 opencode 适配器）
    }

    /**
     * 停止轮询
     * TODO: 与 startPolling 配对实现
     */
    stopPolling() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
    }
}

module.exports = OpenClawAdapter;
