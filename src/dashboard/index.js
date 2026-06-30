/**
 * dashboard/index.js - 仪表盘模块
 */

import { CONFIG, getToolType, getMcpServerName, escapeHtml, truncate, formatTime } from '../config.js';
import { fetchStats, fetchTools, fetchSkills, fetchErrors } from '../utils.js';
import { renderToolRankChart } from './charts.js';

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

    const [stats, tools, skills, errors] = await Promise.all([
      fetchStats(currentProject, currentTimeRange, currentSource),
      fetchTools(currentProject, currentSource),
      fetchSkills(),
      fetchErrors(currentProject, currentSource, 20),
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

    // ═══ 1. 核心指标卡片 ═══
    if (stats) {
      const totals = stats.totals || stats;
      setTextIfExists('totalCalls', (totals?.total_calls || totals?.total || 0).toLocaleString());

      // 技能数
      setTextIfExists('totalSkills', (skills?.totalUniqueSkills || totals?.unique_tools || 0).toString());

      // MCP 数：统计 byTool 中 mcp_ 开头的工具种类数
      const byTool = stats?.byTool || tools || [];
      const mcpToolCount = byTool.filter(t => (t.name || t.tool_name || '').startsWith('mcp_')).length;
      setTextIfExists('totalMcp', mcpToolCount.toString());

      // 错误率
      const totalCalls = totals?.total_calls || 0;
      const errRate = totalCalls > 0
        ? ((totals?.total_errors || 0) / totalCalls * 100)
        : (totals?.error_rate || 0);
      setTextIfExists('errorRate', `${(errRate || 0).toFixed(1)}%`);
    }

    // ═══ 2. 工具使用排行（MCP 按服务器分组） ═══
    let toolRankData = stats?.byTool || tools || [];
    // MCP 分组：mcp_xxx_yyy → xxx，合并同一服务器的调用次数
    const mcpMap = new Map();
    const nonMcp = [];
    for (const t of toolRankData) {
      const name = t.name || t.tool_name || '';
      if (name.startsWith('mcp_')) {
        const server = getMcpServerName(name);
        mcpMap.set(server, (mcpMap.get(server) || 0) + (t.count || 0));
      } else {
        nonMcp.push({ name, count: t.count || 0 });
      }
    }
    for (const [server, count] of mcpMap) {
      nonMcp.push({ name: server, count });
    }
    renderToolRankChart('toolRankChart', nonMcp);

    // ═══ 3. 最近会话 ═══
    renderRecentSessions(errors);

    // ═══ 4. 错误列表 ═══
    renderRecentErrors(errors);
  } catch (e) {
    console.error('[Dashboard] loadDashboardData error:', e);
  }
}

function setTextIfExists(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/**
 * 渲染最近会话
 */
function renderRecentSessions(errors) {
  const container = document.getElementById('recentSessions');
  if (!container) return;

  // 会话数据通过 fetchSessions 获取
  fetch(`${CONFIG.API_BASE}/api/sessions?limit=5${currentProject ? '&project=' + encodeURIComponent(currentProject) : ''}${currentSource ? '&source=' + encodeURIComponent(currentSource) : ''}`)
    .then(r => r.ok ? r.json() : [])
    .then(data => {
      const sessions = data.items || data || [];
      if (!sessions.length) {
        container.innerHTML = '<div class="text-sm text-neutral-400 py-4 text-center">暂无会话</div>';
        return;
      }
      container.innerHTML = sessions.map(s => {
        const source = s.source || s.project_key || '—';
        const toolCount = s.tool_count || s.tools_count || s.call_count || 0;
        const ts = s.last_ts || s.last_timestamp || s.end_time || s.timestamp || '';
        return `
          <div class="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-2 h-2 rounded-full bg-primary-500 shrink-0"></span>
              <span class="text-sm font-medium text-neutral-700 dark:text-neutral-300 truncate">${escapeHtml(source)}</span>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <span class="text-xs text-neutral-400">${toolCount} 工具</span>
              <span class="text-xs text-neutral-500">${formatTime(ts)}</span>
            </div>
          </div>
        `;
      }).join('');
    })
    .catch(() => {
      container.innerHTML = '<div class="text-sm text-neutral-400 py-4 text-center">加载失败</div>';
    });
}

/**
 * 渲染最近错误列表
 */
function renderRecentErrors(errors) {
  const container = document.getElementById('recentErrors');
  if (!container) return;

  if (!errors || errors.length === 0) {
    container.innerHTML = '<div class="text-sm text-success-500 py-4 text-center">🎉 暂无错误</div>';
    return;
  }

  // 倒序（最新在前）
  const sorted = [...errors].reverse().slice(0, 20);
  container.innerHTML = sorted.map(err => {
    const source = err.source || err.project_key || '—';
    const toolName = err.tool_name || err.name || err.tool || '—';
    const msg = err.error || err.message || err.error_message || '';
    const ts = err.timestamp || err.ts || err.time || '';
    return `
      <div class="flex flex-col gap-1 py-2 px-2 rounded-lg hover:bg-danger-50/30 dark:hover:bg-danger-500/5 transition-colors">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-2 h-2 rounded-full bg-danger-500 shrink-0"></span>
            <span class="text-xs font-medium text-neutral-500 dark:text-neutral-400 truncate">${escapeHtml(source)}</span>
            <span class="text-xs text-danger-600 dark:text-danger-400 font-medium truncate">${escapeHtml(toolName)}</span>
          </div>
          <span class="text-xs text-neutral-500 shrink-0">${formatTime(ts)}</span>
        </div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400 pl-4 leading-relaxed break-all">${escapeHtml(truncate(msg, 100))}</div>
      </div>
    `;
  }).join('');
}
