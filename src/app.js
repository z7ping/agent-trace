/**
 * app.js - 主入口
 */

import { CONFIG } from './config.js';
import { fetchProjects, fetchSessions, fetchSessionLogs, checkHookStatus } from './utils.js';
import { renderCallChain } from './callchain/index.js';
import { initDashboard, loadDashboardData } from './dashboard/index.js';

// ─── 全局状态 ───────────────────────────────────────
let currentTab = 'callchain';
let currentTool = 'all';
let currentProject = '';
let autoRefresh = true;
let refreshTimer = null;
let isDark = false;

// ─── 初始化 ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initProjects();
  initEventListeners();
  await loadCallChain();
  initDashboard();
  startAutoRefresh();
  checkStatus();
});

// ─── 主题 ───────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('agent-beat-theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
    isDark = true;
  }
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    isDark = !isDark;
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('agent-beat-theme', isDark ? 'dark' : 'light');
  });
}

// ─── 项目选择 ───────────────────────────────────────
async function initProjects() {
  const projects = await fetchProjects();
  const select = document.getElementById('projectSelect');
  if (!select) return;
  Object.entries(projects).forEach(([key, p]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = p.name || key;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    currentProject = select.value;
    loadCallChain();
    loadDashboardData(currentProject);
  });
}

// ─── 事件监听 ───────────────────────────────────────
function initEventListeners() {
  // 自动刷新
  document.getElementById('autoRefreshBtn')?.addEventListener('click', toggleAutoRefresh);
}

// ─── Tab 切换 ───────────────────────────────────────
window.switchTab = function (tab) {
  currentTab = tab;
  // 更新 tab 按钮样式
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  // 显示/隐藏内容
  document.getElementById('tab-callchain')?.classList.toggle('hidden', tab !== 'callchain');
  document.getElementById('tab-callchain')?.classList.toggle('active', tab === 'callchain');
  document.getElementById('tab-dashboard')?.classList.toggle('hidden', tab !== 'dashboard');
  document.getElementById('tab-dashboard')?.classList.toggle('active', tab === 'dashboard');
  // 调用链操作区
  document.getElementById('callchainActions')?.classList.toggle('hidden', tab !== 'callchain');
  // 切换到仪表盘时加载数据
  if (tab === 'dashboard') {
    loadDashboardData(currentProject);
  }
};

// ─── 工具 Tab 选择 ──────────────────────────────────
window.selectTool = function (tool) {
  currentTool = tool;
  document.querySelectorAll('.tool-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tool === tool);
  });
  loadCallChain();
};

// ─── 自动刷新 ───────────────────────────────────────
function startAutoRefresh() {
  stopAutoRefresh();
  if (autoRefresh) {
    refreshTimer = setInterval(() => {
      if (currentTab === 'callchain') loadCallChain();
    }, CONFIG.REFRESH_INTERVAL);
  }
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

window.toggleAutoRefresh = function () {
  autoRefresh = !autoRefresh;
  const btn = document.getElementById('autoRefreshBtn');
  if (btn) {
    btn.innerHTML = autoRefresh
      ? '<span class="text-success-500">●</span> 自动'
      : '<span class="text-neutral-400">○</span> 暂停';
  }
  autoRefresh ? startAutoRefresh() : stopAutoRefresh();
};

window.toggleSort = function () {
  const btn = document.getElementById('sortBtn');
  if (btn) {
    const isLatest = btn.textContent.includes('最新');
    btn.textContent = isLatest ? '↑ 最早' : '↓ 最新';
  }
  loadCallChain();
};

// ─── 加载调用链 ─────────────────────────────────────
async function loadCallChain() {
  const projects = await fetchProjects();
  const projectKeys = currentProject ? [currentProject] : Object.keys(projects);
  const allLogs = [];

  for (const key of projectKeys) {
    const logs = await fetchSessionLogs(key);
    allLogs.push(...logs);
  }

  // 按工具 Tab 过滤
  const filtered = currentTool === 'all'
    ? allLogs
    : allLogs.filter(log => log.source === currentTool);

  renderCallChain(filtered);
  updateStatusFromLogs(filtered);
}

// ─── 工具类型过滤 ───────────────────────────────────
window.filterTool = function (type) {
  document.querySelectorAll('.filter-chip-sm').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === type);
  });
  applyFilters();
};

// ─── 组合过滤（仅工具类型）──────────────────────────
function applyFilters() {
  const activeTool = document.querySelector('.filter-chip-sm.active')?.dataset.filter || 'all';

  document.querySelectorAll('.call-row').forEach(row => {
    const rowBadge = row.querySelector('.tool-badge');
    const rowType = rowBadge ? [...rowBadge.classList].find(c => ['bash', 'read', 'write', 'mcp', 'agent'].includes(c)) || '' : '';
    const matchTool = activeTool === 'all' || rowType === activeTool;
    row.style.display = matchTool ? '' : 'none';
  });
}

// ─── 状态更新 ───────────────────────────────────────
async function checkStatus() {
  const ok = await checkHookStatus();
  const dot = document.getElementById('hookStatusDot');
  const text = document.getElementById('hookStatusText');
  if (dot) {
    dot.className = `w-2 h-2 rounded-full ${ok ? 'bg-success-500' : 'bg-danger-500'}`;
  }
  if (text) {
    text.textContent = ok ? '在线' : '离线';
  }
}

function updateStatusFromLogs(logs) {
  const errors = logs.filter(l => l.error || l.exit_code !== 0);
  const slow = logs.filter(l => l.duration_ms > CONFIG.SLOW_THRESHOLD);

  const lastErr = document.getElementById('lastError');
  const lastErrText = document.getElementById('lastErrorText');
  if (errors.length > 0) {
    const latest = errors[errors.length - 1];
    lastErr.style.display = 'inline';
    lastErrText.style.display = 'none';
    lastErr.textContent = latest.error || latest.tool_name || '未知错误';
  } else {
    lastErr.style.display = 'none';
    lastErrText.style.display = 'inline';
  }

  const slowCount = document.getElementById('slowCount');
  if (slowCount) slowCount.textContent = slow.length;
}

// ─── 全局函数（HTML onclick 用）─────────────────────
window.setTimeRange = function (range) {
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.range === range);
  });
  loadDashboardData(currentProject, range);
};
