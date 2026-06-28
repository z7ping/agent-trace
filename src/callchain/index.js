/**
 * callchain/index.js - 调用链模块
 */

import { getToolType, getToolColor, formatDuration, formatTime, escapeHtml, truncate } from '../config.js';
import { extractSessions } from '../utils.js';

/**
 * 渲染调用链
 */
export function renderCallChain(logs) {
  const container = document.getElementById('sessionContainer');
  const emptyState = document.getElementById('emptyState');
  if (!container) return;

  const sessions = extractSessions(logs);

  if (sessions.length === 0) {
    container.innerHTML = '';
    emptyState?.classList.remove('hidden');
    return;
  }

  emptyState?.classList.add('hidden');
  container.innerHTML = sessions.map(renderSession).join('');
}

/**
 * 渲染单个会话卡片
 */
function renderSession(session) {
  const toolCount = session.tools.size;
  const duration = formatDuration(session.totalDuration);
  const time = formatTime(session.startTime);
  const hasError = session.errors > 0;

  const header = `
    <div class="session-header" onclick="this.parentElement.querySelector('.session-body').classList.toggle('hidden')">
      <div class="flex items-center gap-3">
        <svg class="w-4 h-4 text-neutral-400 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18l6-6-6-6"/>
        </svg>
        <span class="text-sm font-medium">${escapeHtml(truncate(session.project, 40))}</span>
        ${hasError ? '<span class="inline-flex items-center gap-1 text-xs text-danger-500"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>错误</span>' : ''}
      </div>
      <div class="flex items-center gap-4 text-xs text-neutral-500">
        <span>${toolCount} 次调用</span>
        <span>${duration}</span>
        <span>${time}</span>
      </div>
    </div>
  `;

  const calls = session.calls.map((call, i) => renderCall(call, i)).join('');

  return `
    <div class="session-card">
      ${header}
      <div class="session-body">
        ${calls}
      </div>
    </div>
  `;
}

/**
 * 渲染单个调用行
 */
function renderCall(call, index) {
  const toolName = call.tool_name || call.name || '未知';
  const type = getToolType(toolName);
  const colors = getToolColor(toolName);
  const duration = formatDuration(call.duration_ms);
  const time = formatTime(call.timestamp);
  const isError = call.error || call.exit_code !== 0;
  const isSlow = call.duration_ms > 5000;

  // 状态类
  let rowClass = 'call-row';
  if (isError) rowClass += ' error';
  else if (isSlow) rowClass += ' slow';
  if (type === 'mcp') rowClass += ' mcp';

  // 输入摘要
  const summary = getCallSummary(call);

  // 状态图标
  let statusIcon = '';
  if (isError) {
    statusIcon = '<svg class="w-4 h-4 text-danger-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';
  } else if (isSlow) {
    statusIcon = '<svg class="w-4 h-4 text-warning-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
  }

  // 来源标签
  const source = call.source || '';
  const sourceLabels = {
    'claude-code': 'Claude',
    'hermes': 'Hermes',
    'codex': 'Codex',
    'opencode': 'OpenCode',
    'cursor': 'Cursor',
  };
  const sourceLabel = sourceLabels[source] || source;

  return `
    <div class="${rowClass}" data-source="${escapeHtml(source)}" title="${escapeHtml(JSON.stringify(call).slice(0, 200))}">
      ${statusIcon || '<div class="w-4"></div>'}
      <span class="tool-badge ${type}">${escapeHtml(toolName)}</span>
      ${sourceLabel ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 flex-shrink-0">${escapeHtml(sourceLabel)}</span>` : ''}
      <span class="flex-1 text-sm text-neutral-600 dark:text-neutral-400 font-mono truncate">${escapeHtml(truncate(summary, 80))}</span>
      <span class="text-xs text-neutral-400 flex-shrink-0">${duration}</span>
    </div>
  `;
}

/**
 * 获取调用输入摘要
 */
function getCallSummary(call) {
  const input = call.input || call.arguments || call.tool_input;
  if (!input) return '';

  if (typeof input === 'string') return input;

  // Bash 命令
  if (input.command) return input.command;
  if (input.cmd) return input.cmd;

  // 文件路径
  if (input.path) return input.path;
  if (input.file_path) return input.file_path;
  if (input.filePath) return input.filePath;

  // 搜索
  if (input.pattern) return `grep: ${input.pattern}`;
  if (input.query) return input.query;

  // MCP
  if (input.name) return input.name;

  // 通用
  if (input.tool_name) return input.tool_name;

  return JSON.stringify(input).slice(0, 100);
}
