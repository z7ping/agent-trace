#!/usr/bin/env node
/**
 * 适配器基类
 * 所有工具适配器继承此类并实现 pre() 和 post() 方法
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE_DIR = path.join(__dirname, '..');
const STATES_DIR = path.join(BASE_DIR, 'states');
const LOGS_DIR = path.join(BASE_DIR, 'logs');
const PROJECTS_FILE = path.join(BASE_DIR, 'projects.json');

// 确保目录存在
for (const dir of [STATES_DIR, LOGS_DIR]) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

class BaseAdapter {
    /**
     * 适配器名称（子类必须覆盖）
     * @returns {string}
     */
    get name() {
        throw new Error('Subclass must implement getter "name"');
    }

    /**
     * 处理 PreToolUse 事件
     * @param {Object} data - 从 stdin 读取的 JSON 数据
     */
    async pre(data) {
        throw new Error('Subclass must implement pre()');
    }

    /**
     * 处理 PostToolUse 事件
     * @param {Object} data - 从 stdin 读取的 JSON 数据
     */
    async post(data) {
        throw new Error('Subclass must implement post()');
    }

    /**
     * 获取工具调用记录
     * @param {Object} filter - 过滤条件
     * @returns {Array} 统一格式的调用记录
     */
    async getRecords(filter) {
        throw new Error('Subclass must implement getRecords()');
    }

    // ─── 共享工具方法 ──────────────────────────────────────

    /**
     * 根据工作目录生成项目键
     * @param {string} cwd
     * @returns {string} MD5 前 12 位
     */
    getProjectKey(cwd) {
        if (!cwd) cwd = process.cwd();
        return crypto.createHash('md5').update(cwd).digest('hex').substring(0, 12);
    }

    /**
     * 获取项目名称
     * @param {string} cwd
     * @returns {string}
     */
    getProjectName(cwd) {
        if (!cwd) cwd = process.cwd();
        return path.basename(cwd);
    }

    /**
     * 获取状态文件路径
     * @param {string} projectKey
     * @returns {string}
     */
    getStateFile(projectKey) {
        return path.join(STATES_DIR, `${projectKey}.json`);
    }

    /**
     * 获取日志文件路径
     * @param {string} projectKey
     * @returns {string}
     */
    getLogFile(projectKey) {
        return path.join(LOGS_DIR, `${projectKey}.jsonl`);
    }

    /**
     * 读取调用栈状态
     * @param {string} stateFile
     * @returns {Object}
     */
    readState(stateFile) {
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

    /**
     * 写入调用栈状态
     * @param {string} stateFile
     * @param {Object} state
     */
    writeState(stateFile, state) {
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
    }

    /**
     * 更新项目注册表
     * @param {string} projectKey
     * @param {string} cwd
     * @param {string} projectName
     */
    updateProjectsFile(projectKey, cwd, projectName) {
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

    /**
     * 截断过长的值
     * @param {*} obj
     * @param {number} maxLen
     * @returns {*}
     */
    truncate(obj, maxLen = 200) {
        if (typeof obj === 'string') {
            return obj.length > maxLen ? obj.substring(0, maxLen) + '…' : obj;
        }
        if (Array.isArray(obj)) {
            return obj.slice(0, 10).map(item => this.truncate(item, maxLen));
        }
        if (obj && typeof obj === 'object') {
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.truncate(value, maxLen);
            }
            return result;
        }
        return obj;
    }

    /**
     * 从工具响应中提取错误信息
     * @param {*} response
     * @returns {string|null}
     */
    extractError(response) {
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
                    const err = this.extractError(item);
                    if (err) return err;
                }
            }
        }
        return null;
    }

    /**
     * 从调用栈中弹出匹配的条目
     * @param {Object} state
     * @param {string} toolName
     * @returns {Object|null}
     */
    popFromStack(state, toolName) {
        for (let i = state.stack.length - 1; i >= 0; i--) {
            if (state.stack[i].tool_name === toolName) {
                return state.stack.splice(i, 1)[0];
            }
        }
        return null;
    }

    /**
     * 记录错误日志
     * @param {Error|string} e
     * @param {string} source - 来源标识
     */
    logError(e, source = 'adapter') {
        try {
            const logFile = path.join(BASE_DIR, 'trace_error.log');
            const msg = `[${new Date().toISOString()}] ${source}: ${e.message || e}\n`;
            fs.appendFileSync(logFile, msg, 'utf-8');
        } catch (_) {
            // 写日志本身失败时静默
        }
    }
}

module.exports = BaseAdapter;
