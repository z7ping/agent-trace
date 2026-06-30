/**
 * config.js - 配色与主题配置
 */

export const CONFIG = {
  // API 基础地址（Vite dev server 代理或生产环境同源）
  API_BASE: '',

  // 刷新间隔（毫秒）
  REFRESH_INTERVAL: 3000,

  // 慢调用阈值（毫秒）
  SLOW_THRESHOLD: 5000,

  // 搜索防抖（毫秒）
  SEARCH_DEBOUNCE: 300,

  // 每页条数
  PAGE_SIZE: 50,

  // 工具类型映射
  TOOL_TYPES: {
    Bash: 'bash',
    Terminal: 'bash',
    Execute: 'bash',
    Read: 'read',
    ReadFile: 'read',
    Write: 'write',
    WriteFile: 'write',
    Edit: 'write',
    Patch: 'write',
    Search: 'read',
    SearchFiles: 'read',
    Glob: 'read',
    McpTool: 'mcp',
    MCP: 'mcp',
    Agent: 'agent',
    DelegateTask: 'agent',
  },

  // 工具类型颜色
  TOOL_COLORS: {
    bash: { light: '#d97706', dark: '#fbbf24', bg: 'bg-warning-50 dark:bg-warning-500/10', text: 'text-warning-600 dark:text-warning-400' },
    read: { light: '#2563eb', dark: '#60a5fa', bg: 'bg-primary-50 dark:bg-primary-500/10', text: 'text-primary-600 dark:text-primary-400' },
    write: { light: '#16a34a', dark: '#4ade80', bg: 'bg-success-50 dark:bg-success-500/10', text: 'text-success-600 dark:text-success-400' },
    mcp: { light: '#6366f1', dark: '#818cf8', bg: 'bg-info-50 dark:bg-info-500/10', text: 'text-info-600 dark:text-info-400' },
    agent: { light: '#ea580c', dark: '#fb923c', bg: 'bg-orange-50 dark:bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400' },
    other: { light: '#6b7280', dark: '#9ca3af', bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-600 dark:text-neutral-400' },
  },
};

/**
 * 从 MCP 工具名中提取服务器名
 * mcp_chrome_devtools_list_pages → chrome-devtools
 * mcp_playwright_mcp_browser_navigate → playwright
 * 非 MCP 工具返回原名
 */
export function getMcpServerName(toolName) {
  if (!toolName) return toolName || 'unknown';
  const parts = toolName.split('_');
  if (parts.length >= 3 && parts[0] === 'mcp') {
    return parts[1];
  }
  return toolName;
}

/**
 * 获取工具类型
 */
export function getToolType(toolName) {
  if (!toolName) return 'other';
  const name = toolName.toLowerCase();
  if (['bash', 'terminal', 'execute', 'shell'].some(k => name.includes(k))) return 'bash';
  if (['read', 'readfile', 'search', 'glob', 'find'].some(k => name.includes(k))) return 'read';
  if (['write', 'writefile', 'edit', 'patch', 'create'].some(k => name.includes(k))) return 'write';
  if (['mcp', 'mcptool'].some(k => name.includes(k))) return 'mcp';
  if (['agent', 'delegate', 'subagent'].some(k => name.includes(k))) return 'agent';
  return 'other';
}

/**
 * 获取工具类型颜色
 */
export function getToolColor(toolName) {
  const type = getToolType(toolName);
  return CONFIG.TOOL_COLORS[type] || CONFIG.TOOL_COLORS.other;
}

/**
 * 格式化耗时
 */
export function formatDuration(ms) {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * 格式化时间
 */
export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * 格式化日期
 */
export function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

/**
 * 截断文本
 */
export function truncate(text, maxLen = 80) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

/**
 * HTML 转义
 */
export function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 防抖
 */
export function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
