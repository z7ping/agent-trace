/**
 * utils.js - 工具函数
 */

import { CONFIG } from './config.js';

/**
 * 获取当前项目列表
 */
export async function fetchProjects() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/projects.json`);
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

/**
 * 获取会话列表（JSONL 文件列表）
 */
export async function fetchSessions(projectKey) {
  try {
    const url = projectKey
      ? `${CONFIG.API_BASE}/api/sessions?project=${projectKey}`
      : `${CONFIG.API_BASE}/api/sessions`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * 获取会话调用记录
 */
export async function fetchSessionLogs(projectKey, sessionId) {
  try {
    // 优先从 SQLite API 获取
    const params = new URLSearchParams();
    if (projectKey) params.set('project', projectKey);
    if (sessionId) params.set('session', sessionId);
    params.set('limit', '10000');

    const res = await fetch(`${CONFIG.API_BASE}/api/timeline?${params}`);
    if (!res.ok) {
      // 回退到 JSONL 文件
      return fetchJsonlLogs(projectKey, sessionId);
    }
    const data = await res.json();
    return (data.items || []).map(item => ({
      ts: item.ts,
      session_id: item.session_id || '',
      project_key: item.project_key || '',
      tool_name: item.tool_name,
      source: item.source || '',
      duration_ms: item.duration_ms,
      success: item.success === 1,
      error: item.error,
      seq: item.seq,
      parent_seq: item.parent_seq,
      input_summary: item.input_summary ? JSON.parse(item.input_summary) : {},
    }));
  } catch {
    return fetchJsonlLogs(projectKey, sessionId);
  }
}

/** 回退：从 JSONL 文件读取 */
async function fetchJsonlLogs(projectKey, sessionId) {
  try {
    const url = `${CONFIG.API_BASE}/logs/${projectKey}.jsonl`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    return text.split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean)
      .filter(log => !sessionId || log.session_id === sessionId);
  } catch {
    return [];
  }
}

/**
 * 获取仪表盘统计数据
 * @param {string} project - 项目键
 * @param {string} timeRange - 时间范围
 * @param {string} source - 工具来源
 */
export async function fetchStats(project, timeRange, source) {
  try {
    const params = new URLSearchParams();
    if (project) params.set('project', project);
    if (source) params.set('source', source);
    if (timeRange) {
      // Convert time range to actual date string for SQL WHERE clause
      const sinceDate = getTimeRangeDate(timeRange);
      if (sinceDate) params.set('since', sinceDate);
    }
    const url = `${CONFIG.API_BASE}/api/stats?${params}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * 将时间范围转换为日期字符串（YYYY-MM-DD）
 */
function getTimeRangeDate(range) {
  const now = new Date();
  switch (range) {
    case 'today':
      return now.toISOString().slice(0, 10);
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.toISOString().slice(0, 10);
    }
    case 'month': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d.toISOString().slice(0, 10);
    }
    case 'all':
    default:
      return null;
  }
}

/**
 * 获取工具列表统计
 * @param {string} project - 项目键
 * @param {string} source - 工具来源
 */
export async function fetchTools(project, source) {
  try {
    const params = new URLSearchParams();
    if (project) params.set('project', project);
    if (source) params.set('source', source);
    const url = `${CONFIG.API_BASE}/api/tools?${params}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || data || [];
  } catch {
    return [];
  }
}

/**
 * 获取技能列表
 */
export async function fetchSkills() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/skills`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * 检查 Hook 状态
 */
export async function checkHookStatus() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/stats`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 从日志数据中提取会话信息
 */
export function extractSessions(logs) {
  const sessionMap = new Map();
  for (const log of logs) {
    const sid = log.session_id || 'unknown';
    if (!sessionMap.has(sid)) {
      sessionMap.set(sid, {
        id: sid,
        project: log.project || log.cwd || '',
        startTime: log.timestamp,
        endTime: log.timestamp,
        calls: [],
        tools: new Set(),
        errors: 0,
        totalDuration: 0,
      });
    }
    const session = sessionMap.get(sid);
    session.calls.push(log);
    session.endTime = log.timestamp;
    if (log.tool_name) session.tools.add(log.tool_name);
    if (log.error || log.exit_code !== 0) session.errors++;
    if (log.duration_ms) session.totalDuration += log.duration_ms;
  }
  return Array.from(sessionMap.values()).sort((a, b) => b.startTime - a.startTime);
}
