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
 */
export async function fetchStats(project, timeRange) {
  try {
    const params = new URLSearchParams();
    if (project) params.set('project', project);
    if (timeRange) params.set('since', timeRange);
    const url = `${CONFIG.API_BASE}/api/stats?${params}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * 获取工具列表统计
 */
export async function fetchTools(project) {
  try {
    const params = new URLSearchParams();
    if (project) params.set('project', project);
    const url = `${CONFIG.API_BASE}/api/tools?${params}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * 获取时间线数据
 */
export async function fetchTimeline(project, timeRange) {
  try {
    const params = new URLSearchParams();
    if (project) params.set('project', project);
    if (timeRange) params.set('since', timeRange);
    const url = `${CONFIG.API_BASE}/api/timeline?${params}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
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

/**
 * 获取时间范围的起始时间
 */
export function getTimeRangeStart(range) {
  const now = new Date();
  switch (range) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    case 'week':
      return now.getTime() - 7 * 24 * 60 * 60 * 1000;
    case 'month':
      return now.getTime() - 30 * 24 * 60 * 60 * 1000;
    case 'all':
    default:
      return 0;
  }
}
