/**
 * dashboard/charts.js - Chart.js 图表渲染
 */

import Chart from 'chart.js/auto';
import { CONFIG, getToolType, getToolColor } from '../config.js';

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
 * 工具使用分布（环形图）
 */
export function renderToolDistChart(canvasId, tools) {
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
  const top8 = sorted.slice(0, 8);
  const otherCount = sorted.slice(8).reduce((sum, t) => sum + (t.count || 0), 0);
  const total = sorted.reduce((sum, t) => sum + (t.count || 0), 0);

  // Support both {name, count} and {tool_name, count} formats
  const labels = top8.map(t => t.name || t.tool_name || 'unknown');
  const data = top8.map(t => t.count || 0);
  if (otherCount > 0) {
    labels.push('其他');
    data.push(otherCount);
  }

  const colors = top8.map(t => {
    const toolName = t.name || t.tool_name || '';
    const type = getToolType(toolName);
    const c = getToolColor(type);
    return getChartColors().text === '#a3a3a3' ? c.dark : c.light;
  });
  if (otherCount > 0) colors.push(getChartColors().text);

  const ctx = canvas.getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: getChartColors().text,
            font: { size: 11 },
            padding: 10,
            usePointStyle: true,
            pointStyleWidth: 8,
            generateLabels: (chart) => {
              const data = chart.data;
              if (data.labels.length && data.datasets.length) {
                return data.labels.map((label, i) => {
                  const ds = data.datasets[0];
                  const value = ds.data[i];
                  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                  return {
                    text: `${label} (${pct}%)`,
                    fillStyle: ds.backgroundColor[i],
                    hidden: false,
                    index: i,
                  };
                });
              }
              return [];
            },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed;
              const pct = total > 0 ? ((v / total) * 100).toFixed(1) : 0;
              return `${ctx.label}: ${v.toLocaleString()} 次 (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/**
 * 工具调用排行（横向柱状图）
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

  const sorted = [...tools]
    .sort((a, b) => (b.count || 0) - (a.count || 0));

  const labels = sorted.map(t => t.name || t.tool_name || '未知');
  const data = sorted.map(t => t.count || 0);
  const total = data.reduce((sum, v) => sum + v, 0);

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
        barThickness: 18,
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
            callback: (v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v,
          },
        },
        y: {
          grid: { display: false },
          ticks: {
            color: colors.text,
            font: { size: 11 },
          },
        },
      },
    },
  });
}

/**
 * 技能调用频率（横向柱状图）
 */
export function renderSkillFreqChart(canvasId, skills) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  destroyChart(canvasId);

  // 空数据状态
  if (!skills || skills.length === 0) {
    const parent = canvas.parentElement;
    if (!parent.querySelector('.chart-empty')) {
      canvas.style.display = 'none';
      const empty = document.createElement('div');
      empty.className = 'chart-empty flex flex-col items-center justify-center h-full text-neutral-400 dark:text-neutral-600';
      empty.innerHTML = '<span class="text-2xl mb-1">🎯</span><span class="text-xs">暂无数据</span>';
      parent.appendChild(empty);
    }
    return;
  }
  // 渲染时移除旧空状态
  const oldEmpty = canvas.parentElement?.querySelector('.chart-empty');
  if (oldEmpty) oldEmpty.remove();
  canvas.style.display = '';

  const sorted = [...skills]
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 10);

  const labels = sorted.map(s => {
    const name = s.name || s.skill || '未知';
    // 简化技能名称：移除命名空间前缀
    const parts = name.split('/');
    return parts.length > 1 ? parts[parts.length - 1] : name;
  });
  const data = sorted.map(s => s.count || 0);
  const total = data.reduce((sum, v) => sum + v, 0);

  const colors = getChartColors();
  const ctx = canvas.getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: '#8b5cf6', // 紫色，与技能相关
        borderRadius: 4,
        barThickness: 18,
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
          },
        },
        y: {
          grid: { display: false },
          ticks: {
            color: colors.text,
            font: { size: 11 },
          },
        },
      },
    },
  });
}

/**
 * 时间趋势（折线图）
 */
export function renderTrendChart(canvasId, timeline) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  destroyChart(canvasId);

  if (!timeline || timeline.length === 0) return;

  // 按日期聚合
  const dailyData = {};
  for (const item of timeline) {
    const date = item.date || item.day || new Date(item.timestamp).toISOString().slice(0, 10);
    if (!dailyData[date]) dailyData[date] = { total: 0, errors: 0 };
    dailyData[date].total += item.count || 1;
    if (item.error) dailyData[date].errors++;
  }

  const dates = Object.keys(dailyData).sort();
  const totals = dates.map(d => dailyData[d].total);
  const errors = dates.map(d => dailyData[d].errors);

  const colors = getChartColors();
  const ctx = canvas.getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates.map(d => {
        const dt = new Date(d);
        return `${dt.getMonth() + 1}/${dt.getDate()}`;
      }),
      datasets: [
        {
          label: '调用次数',
          data: totals,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
        {
          label: '错误次数',
          data: errors,
          borderColor: '#dc2626',
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          labels: {
            color: colors.text,
            font: { size: 12 },
            usePointStyle: true,
            pointStyleWidth: 8,
          },
        },
      },
      scales: {
        x: {
          grid: { color: colors.grid },
          ticks: { color: colors.text, font: { size: 11 } },
        },
        y: {
          grid: { color: colors.grid },
          ticks: { color: colors.text, font: { size: 11 } },
          beginAtZero: true,
        },
      },
    },
  });
}
