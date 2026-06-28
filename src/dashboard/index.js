/**
 * dashboard/index.js - 仪表盘模块
 */

import { CONFIG, getToolType, escapeHtml } from '../config.js';
import { fetchStats, fetchTools, fetchTimeline, fetchSkills, getTimeRangeStart } from '../utils.js';
import { renderToolDistChart, renderSkillFreqChart, renderTrendChart } from './charts.js';

let currentTimeRange = 'week';
let currentProject = '';

/**
 * 初始化仪表盘
 */
export function initDashboard() {
  loadDashboardData().catch(e => console.error('[Dashboard] init error:', e));
}

/**
 * 加载仪表盘数据
 */
export async function loadDashboardData(project, timeRange) {
  try {
  if (project !== undefined) currentProject = project;
  if (timeRange) currentTimeRange = timeRange;

  const [stats, tools, skills] = await Promise.all([
    fetchStats(currentProject, currentTimeRange),
    fetchTools(currentProject),
    fetchSkills(),
  ]);

  console.log('[Dashboard] stats:', !!stats, 'tools:', tools?.length, 'skills:', skills?.totalUniqueSkills);

  // 核心指标（兼容新旧格式）
  if (stats) {
    const totals = stats.totals || stats;
    setTextIfExists('totalCalls', totals.total_calls || totals.total || 0);
    const errRate = totals.total_calls > 0
      ? ((totals.total_errors || 0) / totals.total_calls * 100)
      : (totals.error_rate || 0);
    setTextIfExists('errorRate', `${errRate.toFixed(1)}%`);
    setTextIfExists('activeSkills', totals.session_count || totals.unique_tools || 0);
  }

  // 图表
  renderToolDistChart('toolDistChart', tools);
  renderSkillFreqChart('skillFreqChart', skills?.skillsSummary ? Object.entries(skills.skillsSummary).map(([name, v]) => ({ name, count: v.count })) : []);
  renderTrendChart('trendChart', stats?.byDay || []);

  // 会话回顾
  renderSessionReview(tools);

  // 错误分析
  renderErrorAnalysis(stats);
  } catch (e) {
    console.error('[Dashboard] loadDashboardData error:', e);
  }
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

  const errors = stats?.errors || stats?.byTool?.filter(t => t.errors > 0) || stats?.by_tool?.filter(t => t.errors > 0) || [];
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
