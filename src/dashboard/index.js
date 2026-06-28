/**
 * dashboard/index.js - 仪表盘模块
 */

import { CONFIG, getToolType } from '../config.js';
import { fetchStats, fetchTools, fetchTimeline, fetchSkills, getTimeRangeStart } from '../utils.js';
import { renderToolDistChart, renderSkillFreqChart, renderTrendChart } from './charts.js';

let currentTimeRange = 'week';
let currentProject = '';

/**
 * 初始化仪表盘
 */
export function initDashboard() {
  loadDashboardData();
}

/**
 * 加载仪表盘数据
 */
export async function loadDashboardData(project, timeRange) {
  if (project !== undefined) currentProject = project;
  if (timeRange) currentTimeRange = timeRange;

  const [stats, tools, timeline, skills] = await Promise.all([
    fetchStats(currentProject, currentTimeRange),
    fetchTools(currentProject),
    fetchTimeline(currentProject, currentTimeRange),
    fetchSkills(),
  ]);

  // 核心指标
  if (stats) {
    setTextIfExists('totalCalls', stats.total_calls || stats.total || 0);
    setTextIfExists('errorRate', `${(stats.error_rate || 0).toFixed(1)}%`);
    setTextIfExists('activeSkills', stats.unique_tools || stats.tools || 0);
  }

  // 图表
  renderToolDistChart('toolDistChart', tools);
  renderSkillFreqChart('skillFreqChart', skills);
  renderTrendChart('trendChart', timeline);

  // 会话回顾
  renderSessionReview(tools);

  // 错误分析
  renderErrorAnalysis(stats);
}

function setTextIfExists(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/**
 * 渲染会话回顾
 */
function renderSessionReview(tools) {
  const container = document.getElementById('sessionReview');
  if (!container) return;

  if (!tools || tools.length === 0) {
    container.innerHTML = '<div class="text-sm text-neutral-400 py-4 text-center">暂无数据</div>';
    return;
  }

  const sorted = [...tools].sort((a, b) => (b.count || 0) - (a.count || 0));
  container.innerHTML = sorted.slice(0, 8).map(tool => {
    const type = getToolType(tool.name);
    const colors = CONFIG.TOOL_COLORS[type] || CONFIG.TOOL_COLORS.other;
    return `
      <div class="flex items-center justify-between py-1.5">
        <span class="text-sm font-medium">${escapeHtml(tool.name)}</span>
        <span class="text-sm text-neutral-500">${tool.count || 0} 次</span>
      </div>
    `;
  }).join('');
}

/**
 * 渲染错误分析
 */
function renderErrorAnalysis(stats) {
  const container = document.getElementById('errorTop5');
  if (!container) return;

  const errors = stats?.errors || stats?.by_tool?.filter(t => t.errors > 0) || [];
  if (errors.length === 0) {
    container.innerHTML = '<div class="text-sm text-success-500 py-4 text-center">🎉 暂无错误</div>';
    return;
  }

  const sorted = [...errors].sort((a, b) => (b.error_count || b.errors || 0) - (a.error_count || a.errors || 0));
  container.innerHTML = sorted.slice(0, 5).map(err => `
    <div class="flex items-center justify-between py-1.5">
      <span class="text-sm text-danger-500">${escapeHtml(err.name || err.tool || '未知')}</span>
      <span class="text-sm font-medium">${err.error_count || err.errors || 0} 次</span>
    </div>
  `).join('');
}
