/**
 * dashboard/charts.js - Chart.js 图表渲染
 */

import Chart from 'chart.js/auto';
import { CONFIG, getToolType } from '../config.js';

const chartInstances = {};

/**
 * 销毁已有图表
 */
function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

/**
 * 获取图表颜色（亮/暗模式自适应）
 */
function getChartColors() {
  const isDark = document.documentElement.classList.contains('dark');
  return {
    text: isDark ? '#a3a3a3' : '#6b7280',
    grid: isDark ? '#262626' : '#f3f4f6',
    bg: isDark ? '#171717' : '#ffffff',
  };
}

/**
 * 工具使用排行（全宽横向柱状图，不截断）
 * @param {string} canvasId
 * @param {Array<{name: string, count: number}>} tools - 已分组的工具数据
 */
export function renderToolRankChart(canvasId, tools) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  destroyChart(canvasId);

  // 空数据状态
  if (!tools || tools.length === 0) {
    const parent = canvas.parentElement;
    if (!parent.querySelector('.chart-empty')) {
      canvas.style.display = 'none';
      const empty = document.createElement('div');
      empty.className = 'chart-empty flex flex-col items-center justify-center h-full text-neutral-400 dark:text-neutral-600';
      empty.innerHTML = '<span class="text-2xl mb-1">📊</span><span class="text-xs">暂无数据</span>';
      parent.appendChild(empty);
    }
    return;
  }
  // 渲染时移除旧空状态
  const oldEmpty = canvas.parentElement?.querySelector('.chart-empty');
  if (oldEmpty) oldEmpty.remove();
  canvas.style.display = '';

  const sorted = [...tools].sort((a, b) => (b.count || 0) - (a.count || 0));

  const labels = sorted.map(t => t.name || t.tool_name || '未知');
  const data = sorted.map(t => t.count || 0);
  const total = data.reduce((sum, v) => sum + v, 0);

  // 动态调整容器高度：每个条形约 30px，最小 200px
  const barHeight = 30;
  const minBars = 5;
  const chartHeight = Math.max(minBars * barHeight, sorted.length * barHeight + 40);
  const container = canvas.parentElement;
  if (container) {
    container.style.height = `${chartHeight}px`;
  }

  // 使用工具类型颜色
  const barColors = labels.map(name => {
    const type = getToolType(name);
    const c = CONFIG.TOOL_COLORS[type] || CONFIG.TOOL_COLORS.other;
    return getChartColors().text === '#a3a3a3' ? c.dark : c.light;
  });

  const colors = getChartColors();
  const ctx = canvas.getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: barColors,
        borderRadius: 4,
        barThickness: 20,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.x;
              const pct = total > 0 ? ((v / total) * 100).toFixed(1) : 0;
              return `${v.toLocaleString()} 次 (${pct}%)`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: colors.grid },
          ticks: {
            color: colors.text,
            font: { size: 11 },
            callback: (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v,
          },
        },
        y: {
          grid: { display: false },
          ticks: {
            color: colors.text,
            font: { size: 12 },
          },
        },
      },
    },
  });
}
