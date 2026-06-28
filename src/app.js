/**
 * app.js - 主入口
 */

import { CONFIG } from './config.js';
import { fetchProjects, fetchSessions, fetchSessionLogs, checkHookStatus } from './utils.js';
import { renderCallChain } from './callchain/index.js';
import { initDashboard, loadDashboardData } from './dashboard/index.js';

// ─── 全局状态 ───────────────────────────────────────
let currentTab = 'callchain';
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
  isDark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme();
}

function toggleTheme() {
  isDark = !isDark;
  localStorage.setItem('agent-beat-theme', isDark ? 'dark' : 'light');
  applyTheme();
}

function applyTheme() {
  document.documentElement.classList.toggle('dark', isDark);
}

// ─── Tab 切换 ───────────────────────────────────────
window.switchTab = function (tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== `tab-${tab}`);
    panel.classList.toggle('active', panel.id === `tab-${tab}`);
  });
  if (tab === 'dashboard') {
    loadDashboardData(currentProject);
  }
};

// ─── 项目列表 ───────────────────────────────────────
async function initProjects() {
  const projects = await fetchProjects();
  const select = document.getElementById('projectSelect');
  const dashSelect = document.getElementById('dashProjectSelect');
  const projectList = Object.entries(projects);

  [select, dashSelect].forEach(el => {
    if (!el) return;
    el.innerHTML = '<option value="">全部项目</option>';
    projectList.forEach(([key, info]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = info.name || key;
      el.appendChild(opt);
    });
  });
}

// ─── 事件监听 ───────────────────────────────────────
function initEventListeners() {
  // 主题切换
  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

  // 项目切换
  document.getElementById('projectSelect')?.addEventListener('change', (e) => {
    currentProject = e.target.value;
    document.getElementById('dashProjectSelect').value = currentProject;
    loadCallChain();
  });

  document.getElementById('dashProjectSelect')?.addEventListener('change', (e) => {
    currentProject = e.target.value;
    document.getElementById('projectSelect').value = currentProject;
    loadDashboardData(currentProject);
  });

  // 搜索
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const query = searchInput.value.trim();
        searchClear.classList.toggle('hidden', !query);
        filterCallsBySearch(query);
      }, CONFIG.SEARCH_DEBOUNCE);
    });
  }
  searchClear?.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.add('hidden');
    filterCallsBySearch('');
  });
}

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
    btn.textContent = isLatest ? '↑ 最早优先' : '↓ 最新优先';
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

  renderCallChain(allLogs);
  updateStatusFromLogs(allLogs);
}

// ─── 搜索过滤 ───────────────────────────────────────
function filterCallsBySearch(query) {
  const rows = document.querySelectorAll('.call-row');
  rows.forEach(row => {
    if (!query) {
      row.style.display = '';
      return;
    }
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query.toLowerCase()) ? '' : 'none';
  });
}

// ─── 工具类型过滤 ───────────────────────────────────
window.filterTool = function (type) {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === type);
  });
  applyFilters();
};

// ─── 来源过滤 ───────────────────────────────────────
window.filterSource = function (source) {
  document.querySelectorAll('.source-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.source === source);
  });
  applyFilters();
};

// ─── 组合过滤 ───────────────────────────────────────
function applyFilters() {
  const activeSource = document.querySelector('.source-chip.active')?.dataset.source || 'all';
  const activeTool = document.querySelector('.filter-chip.active')?.dataset.filter || 'all';

  document.querySelectorAll('.call-row').forEach(row => {
    const rowSource = row.dataset.source || '';
    const rowBadge = row.querySelector('.tool-badge');
    const rowType = rowBadge ? [...rowBadge.classList].find(c => ['bash', 'read', 'write', 'mcp', 'agent'].includes(c)) || '' : '';

    const matchSource = activeSource === 'all' || rowSource === activeSource;
    const matchTool = activeTool === 'all' || rowType === activeTool;

    row.style.display = (matchSource && matchTool) ? '' : 'none';
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
window.clearSearch = function () {
  const input = document.getElementById('searchInput');
  const clear = document.getElementById('searchClear');
  if (input) input.value = '';
  if (clear) clear.classList.add('hidden');
  filterCallsBySearch('');
};

window.setTimeRange = function (range) {
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.range === range);
  });
  loadDashboardData(currentProject, range);
};
