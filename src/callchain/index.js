/**
 * callchain/index.js - 调用链模块
 */

import { getToolType, getToolColor, formatDuration, formatTime, escapeHtml, truncate } from '../config.js';
import { extractSessions } from '../utils.js';

/** 渲染调用链 */
export function renderCallChain(data) {
  const container = document.getElementById('sessionContainer');
  const emptyState = document.getElementById('emptyState');
  if (!container) return;

  // 兼容两种格式：原始 log 条目 or session 摘要
  let sessions;
  if (data.length > 0 && data[0].session_id && data[0].tool_count !== undefined) {
    // 已经是 session 摘要格式
    sessions = data.map(s => ({
      id: s.session_id,
      project: s.project_key || '',
      source: s.source || '',
      startTime: s.start_time,
      endTime: s.end_time,
      calls: [],
      tools: new Set(),
      errors: s.error_count || 0,
      totalDuration: s.total_duration_ms || 0,
      toolCount: s.tool_count || 0,
    }));
  } else {
    sessions = extractSessions(data);
  }

  if (sessions.length === 0) {
    container.innerHTML = '';
    emptyState?.classList.remove('hidden');
    return;
  }

  emptyState?.classList.add('hidden');
  container.innerHTML = sessions.map(renderSession).join('');
}

/** 根据字符串生成稳定颜色（用于 session ID） */
function hashColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 45%)`;
}

/** 短 session ID */
function shortId(sid) {
  if (!sid) return '—';
  if (sid.length <= 12) return sid;
  return sid.slice(0, 8) + '…';
}

/** 格式化时间范围 */
function formatTimeRange(start, end) {
  if (!start) return '';
  const s = new Date(start);
  const e = end ? new Date(end) : s;
  const fmtDate = (d) => d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
  const fmtTime = (d) => d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  // 同一天：2026-06-28 13:22:42~13:42:42
  if (fmtDate(s) === fmtDate(e)) {
    return `${fmtDate(s)} ${fmtTime(s)}~${fmtTime(e)}`;
  }
  // 跨天：2026-06-28 13:22~06-29 01:42
  return `${fmtDate(s)} ${fmtTime(s)}~${fmtDate(e)} ${fmtTime(e)}`;
}

/** 构建树形结构 */
function buildTree(calls) {
  // 按 seq 建索引
  const seqMap = new Map();
  for (const c of calls) {
    if (c.seq != null) seqMap.set(c.seq, { ...c, children: [] });
  }
  // 建立父子关系
  const roots = [];
  for (const c of calls) {
    const node = c.seq != null ? seqMap.get(c.seq) : null;
    if (!node) { roots.push({ ...c, children: [], _depth: 0 }); continue; }
    const parent = c.parent_seq != null ? seqMap.get(c.parent_seq) : null;
    if (parent) {
      node._depth = (parent._depth || 0) + 1;
      parent.children.push(node);
    } else {
      node._depth = 0;
      roots.push(node);
    }
  }
  // 扁平化（保留树序）
  const flat = [];
  function walk(nodes) {
    for (const n of nodes) {
      flat.push(n);
      if (n.children.length) walk(n.children);
    }
  }
  walk(roots);
  // 如果树构建失败（无 seq），回退到原始顺序
  if (flat.length !== calls.length) {
    return calls.map(c => ({ ...c, children: [], _depth: 0 }));
  }
  return flat;
}

/** 渲染单个会话卡片 */
function renderSession(session) {
  const toolCount = session.toolCount || session.tools?.size || 0;
  const duration = formatDuration(session.totalDuration);
  const timeRange = formatTimeRange(session.startTime, session.endTime);
  const hasError = session.errors > 0;
  const okCount = (session.toolCount || session.calls?.length || 0) - session.errors;
  const isActive = (Date.now() - new Date(session.endTime).getTime()) < 5 * 60 * 1000;
  const color = hashColor(session.id);
  const avgDur = (session.toolCount || session.calls?.length || 0) > 0 ? session.totalDuration / (session.toolCount || session.calls.length) : 0;

  const header = `
    <div class="session-header">
      <div class="flex items-center gap-2">
        <svg class="session-arrow w-3 h-3 text-neutral-400 transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18l6-6-6-6"/>
        </svg>
        <span class="session-id font-mono text-xs font-semibold" style="color:${color}" title="会话ID: ${escapeHtml(session.id)}">${escapeHtml(shortId(session.id))}</span>
        <span class="text-xs text-neutral-500">${escapeHtml(truncate(session.project, 30))}</span>
        <span class="text-xs text-neutral-400">${timeRange}</span>
      </div>
      <div class="flex items-center gap-3 text-xs text-neutral-500">
        <span>📋 ${session.calls.length}</span>
        <span class="text-success-600 dark:text-success-400">✅ ${okCount}</span>
        ${hasError ? `<span class="text-danger-500">❌ ${session.errors}</span>` : ''}
        <span class="text-neutral-400">⚡ ${formatDuration(avgDur)}</span>
      </div>
    </div>
  `;

  // 树形渲染调用
  const tree = buildTree(session.calls);
  const calls = tree.map((call, i) => renderCall(call, i, session.project)).join('');

  return `
    <div class="session-card${isActive ? ' active-session' : ''}" onclick="toggleSession(this)">
      ${header}
      <div class="session-body hidden">
        ${calls}
      </div>
    </div>
  `;
}

/** 渲染单个调用行 */
function renderCall(call, index, projectPath) {
  const toolName = call.tool_name || call.name || '未知';
  const type = getToolType(toolName);
  const colors = getToolColor(toolName);
  const duration = formatDuration(call.duration_ms);
  const isError = call.error === true || call.success === false || (call.exit_code != null && call.exit_code !== 0);
  const isSlow = call.duration_ms > 5000;
  const depth = call._depth || 0;

  // 状态类
  let rowClass = 'call-row';
  if (isError) rowClass += ' error';
  else if (isSlow) rowClass += ' slow';
  if (type === 'mcp') rowClass += ' mcp';

  // 输入摘要 + 文件路径
  const summary = getCallSummary(call);
  const filePath = getFilePath(call, projectPath);

  // 状态图标
  let statusIcon = '';
  if (isError) {
    statusIcon = '<svg class="w-4 h-4 text-danger-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';
  } else if (isSlow) {
    statusIcon = '<svg class="w-4 h-4 text-warning-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
  }

  // 来源标签
  const source = call.source || '';
  const sourceLabels = { 'claude-code': 'Claude', 'hermes': 'Hermes', 'codex': 'Codex', 'opencode': 'OpenCode', 'cursor': 'Cursor' };
  const sourceLabel = sourceLabels[source] || source;

  // 树形缩进
  const indent = depth > 0
    ? `<span class="tree-indent" style="width:${depth * 20}px"></span>`
    : '';

  return `
    <div class="${rowClass}" data-source="${escapeHtml(source)}" style="padding-left:${12 + depth * 20}px">
      ${indent}
      ${statusIcon || '<div class="w-4"></div>'}
      <span class="tool-badge ${type}">${escapeHtml(toolName)}</span>
      ${sourceLabel ? `<span class="text-xs px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 flex-shrink-0">${escapeHtml(sourceLabel)}</span>` : ''}
      <span class="flex-1 text-sm text-neutral-600 dark:text-neutral-400 truncate" title="${escapeHtml(summary)}">${escapeHtml(truncate(summary, 60))}</span>
      ${filePath ? `<span class="text-xs text-neutral-400 dark:text-neutral-500 truncate max-w-[300px] flex-shrink-0 font-mono" title="${escapeHtml(filePath.full)}">📂 ${escapeHtml(filePath.short)}</span>` : ''}
      <span class="text-xs text-neutral-400 flex-shrink-0">${duration}</span>
    </div>
  `;
}

/** 获取调用输入摘要 */
function getCallSummary(call) {
  const input = call.input || call.arguments || call.tool_input;
  const summary = call.input_summary || {};

  if (input && typeof input === 'string') return input;

  // Bash 命令
  if (input?.command) return input.command;
  if (input?.cmd) return input.cmd;
  if (summary.command) return summary.command;

  // 搜索
  if (input?.pattern) return `grep: ${input.pattern}`;
  if (input?.query) return input.query;
  if (summary.pattern) return `grep: ${summary.pattern}`;

  // MCP
  if (input?.name) return input.name;
  if (summary.name) return summary.name;

  // 文件路径（作为摘要的一部分）
  const filePath = getFilePath(call);
  if (filePath) return filePath.short;

  // 描述
  if (summary.description) return summary.description;

  // 通用
  if (input?.tool_name) return input.tool_name;

  // 回退：input_summary 的值
  if (typeof summary === 'object' && Object.keys(summary).length > 0) {
    const vals = Object.values(summary).filter(v => typeof v === 'string');
    if (vals.length) return vals[0];
  }

  return JSON.stringify(input || summary).slice(0, 100);
}

/** 获取文件路径（省略共同前缀） */
function getFilePath(call, projectPath) {
  const input = call.input || call.arguments || call.tool_input;
  const summary = call.input_summary || {};
  // 检查所有可能的路径字段
  const rawPath = (input && (input.path || input.file_path || input.filePath || input.new_path || input.old_path))
    || summary.file_path || summary.path || summary.filePath;
  if (!rawPath || typeof rawPath !== 'string') return null;

  const full = rawPath;
  // 省略项目路径前缀
  let short = full;
  if (projectPath && full.startsWith(projectPath)) {
    short = full.slice(projectPath.length).replace(/^\//, '');
  } else {
    // 省略 home 目录前缀
    const homeMatch = full.match(/^\/home\/[^/]+/);
    if (homeMatch) {
      short = '~' + full.slice(homeMatch[0].length);
    }
  }
  // 如果还是太长，省略中间部分
  if (short.length > 50) {
    const parts = short.split('/');
    if (parts.length > 3) {
      short = parts[0] + '/…/' + parts.slice(-2).join('/');
    }
  }

  return { full, short };
}
