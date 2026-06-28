/**
 * callchain/index.js - 调用链模块
 */

import { getToolType, getToolColor, formatDuration, formatTime, escapeHtml, truncate } from '../config.js';
import { extractSessions } from '../utils.js';

/** 记录当前展开的 session ID */
let expandedSessionIds = new Set();

/** 渲染调用链 */
export function renderCallChain(data) {
  const container = document.getElementById('sessionContainer');
  const emptyState = document.getElementById('emptyState');
  if (!container) return;

  // 渲染前保存当前展开状态
  expandedSessionIds = new Set(
    Array.from(container.querySelectorAll('.session-card'))
      .filter(card => {
        const body = card.querySelector('.session-body');
        return body && !body.classList.contains('hidden');
      })
      .map(card => card.dataset.sessionId)
  );

  // 兼容两种格式：原始 log 条目 or session 摘要
  let sessions;
  if (data.length > 0 && data[0].session_id && data[0].tool_count !== undefined) {
    // 已经是 session 摘要格式
    sessions = data.map(s => ({
      id: s.session_id,
      project: s.project_key || '',
      projectName: s.project_name || s.project_key || '',
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

  // 渲染后恢复展开状态
  for (const sessionId of expandedSessionIds) {
    const card = container.querySelector(`.session-card[data-session-id="${sessionId}"]`);
    if (card) {
      const body = card.querySelector('.session-body');
      const arrow = card.querySelector('.session-arrow');
      if (body) {
        body.classList.remove('hidden');
        if (arrow) arrow.style.transform = 'rotate(90deg)';
      }
    }
  }
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
  if (!calls || calls.length === 0) return [];

  // 按 seq 升序排序（API 可能返回倒序），无 seq 的放最后保持原序
  const sorted = [...calls].sort((a, b) => {
    if (a.seq == null && b.seq == null) return 0;
    if (a.seq == null) return 1;
    if (b.seq == null) return -1;
    return a.seq - b.seq;
  });

  // 按 seq 建索引（用排序后的引用）
  const seqMap = new Map();
  for (const c of sorted) {
    if (c.seq != null) seqMap.set(c.seq, { ...c, children: [] });
  }

  // 按 seq 升序遍历建立父子关系（父节点一定先于子节点被处理）
  const roots = [];
  for (const c of sorted) {
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

  // 来源标签样式
  const source = session.source || '';
  const sourceLabels = { 'claude-code': 'Claude', 'hermes': 'Hermes', 'codex': 'Codex', 'opencode': 'OpenCode', 'cursor': 'Cursor' };
  const sourceColors = {
    'claude-code': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'hermes': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    'codex': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'opencode': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    'cursor': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  };
  const sourceLabel = sourceLabels[source] || source;
  const sourceColor = sourceColors[source] || 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400';

  // 项目名（优先使用 project_name，回退到 project_key）
  const projectName = session.projectName || session.project || '';

  const header = `
    <div class="session-header" onclick="toggleSession(event.currentTarget)">
      <div class="flex items-center gap-2">
        <svg class="session-arrow w-3 h-3 text-neutral-400 transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18l6-6-6-6"/>
        </svg>
        <span class="session-id font-mono text-xs font-semibold" style="color:${color}" title="会话ID: ${escapeHtml(session.id)}">${escapeHtml(shortId(session.id))}</span>
        ${sourceLabel ? `<span class="text-[10px] px-1.5 py-0.5 rounded-md font-medium ${sourceColor}">${escapeHtml(sourceLabel)}</span>` : ''}
        <span class="text-xs text-neutral-500 dark:text-neutral-400 font-medium">${escapeHtml(truncate(projectName, 30))}</span>
        <span class="text-xs text-neutral-400">${timeRange}</span>
      </div>
      <div class="flex items-center gap-3 text-xs text-neutral-500">
        <span>📋 ${toolCount}</span>
        <span class="text-success-600 dark:text-success-400">✅ ${okCount}</span>
        ${hasError ? `<span class="text-danger-500">❌ ${session.errors}</span>` : ''}
        <span class="text-neutral-400">⚡ ${formatDuration(avgDur)}</span>
      </div>
    </div>
  `;

  // 树形渲染调用
  const tree = buildTree(session.calls);
  const calls = tree.map((call, i) => renderCall(call, i, session.project)).join('');

  // 来源左边框颜色
  const sourceBorderColors = {
    'claude-code': 'border-l-blue-500 dark:border-l-blue-400',
    'hermes': 'border-l-purple-500 dark:border-l-purple-400',
    'codex': 'border-l-green-500 dark:border-l-green-400',
    'opencode': 'border-l-orange-500 dark:border-l-orange-400',
    'cursor': 'border-l-cyan-500 dark:border-l-cyan-400',
  };
  const borderClass = sourceBorderColors[source] || 'border-l-neutral-300 dark:border-l-neutral-600';

  return `
    <div class="session-card ${borderClass}${isActive ? ' active-session' : ''}"
         data-session-id="${escapeHtml(session.id)}"
         data-source="${escapeHtml(session.source)}">
      ${header}
      <div class="session-body hidden">
        ${calls.length > 0 ? calls : '<div class="text-center py-4 text-neutral-400 text-sm">加载中...</div>'}
      </div>
    </div>
  `;
}

/** JSON 语法高亮（逐字符 token 化，避免正则误匹配） */
function highlightJson(json) {
  const out = [];
  let i = 0;
  const len = json.length;

  while (i < len) {
    const ch = json[i];

    // 字符串
    if (ch === '"') {
      let j = i + 1;
      while (j < len && json[j] !== '"') {
        if (json[j] === '\\') j++;
        j++;
      }
      j++;
      const raw = json.slice(i, j);
      const escaped = escapeHtml(raw);
      // 后面紧跟 `:` 的是 key
      let k = j;
      while (k < len && json[k] === ' ') k++;
      if (json[k] === ':') {
        out.push(`<span class="jk">${escaped}</span>`);
      } else {
        out.push(`<span class="js">${escaped}</span>`);
      }
      i = j;
      continue;
    }

    // 数字
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let j = i;
      if (json[j] === '-') j++;
      while (j < len && json[j] >= '0' && json[j] <= '9') j++;
      if (j < len && json[j] === '.') {
        j++;
        while (j < len && json[j] >= '0' && json[j] <= '9') j++;
      }
      out.push(`<span class="jn">${escapeHtml(json.slice(i, j))}</span>`);
      i = j;
      continue;
    }

    // 布尔/null
    if (json.slice(i, i + 4) === 'true') {
      out.push('<span class="jb">true</span>');
      i += 4; continue;
    }
    if (json.slice(i, i + 5) === 'false') {
      out.push('<span class="jb">false</span>');
      i += 5; continue;
    }
    if (json.slice(i, i + 4) === 'null') {
      out.push('<span class="jb">null</span>');
      i += 4; continue;
    }

    // 其他字符
    out.push(escapeHtml(ch));
    i++;
  }

  return out.join('');
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

  // 原始 JSON（转义 HTML + 语法高亮）
  const rawJson = highlightJson(JSON.stringify(call, null, 2));

  return `
    <div class="${rowClass}" data-source="${escapeHtml(source)}" style="padding-left:${12 + depth * 20}px" onclick="toggleCallDetail(this)">
      ${indent}
      ${statusIcon || '<div class="w-4"></div>'}
      <span class="tool-badge ${type}">${escapeHtml(toolName)}</span>
      ${sourceLabel ? `<span class="text-xs px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 flex-shrink-0">${escapeHtml(sourceLabel)}</span>` : ''}
      <span class="flex-1 text-sm text-neutral-600 dark:text-neutral-400 truncate" title="${escapeHtml(summary)}">${escapeHtml(truncate(summary, 60))}</span>
      ${filePath ? `<span class="text-xs text-neutral-400 dark:text-neutral-500 truncate max-w-[300px] flex-shrink-0 font-mono" title="${escapeHtml(filePath.full)}">📂 ${escapeHtml(filePath.short)}</span>` : ''}
      <span class="text-xs text-neutral-400 flex-shrink-0">${duration}</span>
    </div>
    <div class="call-detail hidden"><pre>${rawJson}</pre></div>
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

  // 最终回退：避免显示空对象
  const fallback = input || summary;
  if (fallback && typeof fallback === 'object' && Object.keys(fallback).length === 0) return '';
  return JSON.stringify(fallback).slice(0, 100);
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

/** 渲染调用列表（供外部懒加载使用） */
export function renderCallChainCalls(calls) {
  if (!calls || calls.length === 0) return '';
  const tree = buildTree(calls);
  return tree.map((call, i) => renderCall(call, i, '')).join('');
}

/** 切换调用行的 JSON 详情面板 */
window.toggleCallDetail = function (rowEl) {
  const detail = rowEl.nextElementSibling;
  if (!detail || !detail.classList.contains('call-detail')) return;
  detail.classList.toggle('hidden');
};
