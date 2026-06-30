/**
 * dashboard/index.js - 仪表盘模块
 */

import { CONFIG, getToolType, escapeHtml } from '../config.js';
import { fetchStats, fetchTools, fetchSkills } from '../utils.js';
import { renderToolDistChart, renderToolRankChart, renderSkillFreqChart, renderTrendChart } from './charts.js';

let currentTimeRange = 'week';
let currentProject = '';
let currentSource = '';

/**
 * 初始化仪表盘
 */
export function initDashboard() {
  loadDashboardData().catch(e => console.error('[Dashboard] init error:', e));
}

/**
 * 加载仪表盘数据
 * @param {string} project - 项目键
 * @param {string} timeRange - 时间范围
 * @param {string} source - 工具来源（如 'claude-code', 'hermes' 等）
 */
export async function loadDashboardData(project, timeRange, source) {
  try {
  if (project !== undefined) currentProject = project;
  if (timeRange) currentTimeRange = timeRange;
  if (source !== undefined) currentSource = source;

  const [stats, tools, skills] = await Promise.all([
    fetchStats(currentProject, currentTimeRange, currentSource),
    fetchTools(currentProject, currentSource),
    fetchSkills(),
  ]);

  console.log('[Dashboard] stats:', !!stats, 'tools:', tools?.length, 'skills:', skills?.totalUniqueSkills);

  // 判断是否有数据
  const hasData = stats && (
    (stats.totals?.total_calls || stats.totals?.total || stats.total_calls || 0) > 0
    || (tools && tools.length > 0)
  );

  const dashboardEmpty = document.getElementById('dashboardEmpty');
  const dashboardContent = document.getElementById('dashboardContent');
  if (dashboardEmpty) dashboardEmpty.classList.toggle('hidden', hasData);
  if (dashboardContent) dashboardContent.classList.toggle('hidden', !hasData);

  if (!hasData) return;

  // 核心指标（兼容新旧格式）
  if (stats) {
    const totals = stats.totals || stats;
    setTextIfExists('totalCalls', (totals?.total_calls || totals?.total || 0).toLocaleString());
    const totalCalls = totals?.total_calls || 0;
    const errRate = totalCalls > 0
      ? ((totals?.total_errors || 0) / totalCalls * 100)
      : (totals?.error_rate || 0);
    setTextIfExists('errorRate', `${(errRate || 0).toFixed(1)}%`);
    setTextIfExists('activeSessions', totals?.session_count || 0);
    setTextIfExists('activeSkills', skills?.totalUniqueSkills || totals?.unique_tools || 0);
  }

  // 图表
  renderToolDistChart('toolDistChart', tools);
  // 工具调用排行：使用 byTool 数据（更丰富），回退到 tools 数据
  const toolRankData = stats?.byTool || tools || [];
  renderToolRankChart('toolRankChart', toolRankData);
  // 技能调用频率：仅 Claude Code 支持，其他工具显示空状态
  if (currentSource && currentSource !== 'claude-code') {
    renderSkillFreqChart('skillFreqChart', []);
  } else {
    const skillData = skills?.skillsSummary
      ? Object.entries(skills.skillsSummary).map(([name, v]) => ({ name, count: v.count }))
      : [];
    renderSkillFreqChart('skillFreqChart', skillData);
  }
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
  const total = sorted.reduce((sum, t) => sum + (t.count || 0), 0);

  container.innerHTML = sorted.slice(0, 8).map(tool => {
    const toolName = tool.name || tool.tool_name || 'unknown';
    const type = getToolType(toolName);
    const colors = CONFIG.TOOL_COLORS[type] || CONFIG.TOOL_COLORS.other;
    const count = tool.count || 0;
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
    return `
      <div class="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full ${colors.bg}"></span>
          <span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">${escapeHtml(toolName)}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-neutral-400">${pct}%</span>
          <span class="text-sm font-semibold text-neutral-600 dark:text-neutral-400">${count.toLocaleString()}</span>
        </div>
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
  container.innerHTML = sorted.slice(0, 5).map(err => {
    const name = err.name || err.tool_name || err.tool || '未知';
    const count = err.error_count || err.errors || 0;
    return `
      <div class="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-danger-50/50 dark:hover:bg-danger-500/5 transition-colors">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-danger-500"></span>
          <span class="text-sm font-medium text-danger-600 dark:text-danger-400">${escapeHtml(name)}</span>
        </div>
        <span class="text-sm font-semibold text-danger-600 dark:text-danger-400">${count} 次</span>
      </div>
    `;
  }).join('');
}
