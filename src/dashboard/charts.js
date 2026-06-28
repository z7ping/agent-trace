/**
 * dashboard/charts.js - Chart.js 图表渲染
 */

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
    if (!parent.querySelector('.empty-state')) {
      canvas.style.display = 'none';
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<div class="empty-state-icon">📊</div><div class="text-sm">暂无工具使用数据</div>';
      parent.appendChild(empty);
    }
    return;
  }
  canvas.style.display = '';

  if (!tools || tools.length === 0) return;

  const sorted = [...tools].sort((a, b) => (b.count || 0) - (a.count || 0));
  const top8 = sorted.slice(0, 8);
  const otherCount = sorted.slice(8).reduce((sum, t) => sum + (t.count || 0), 0);

  const labels = top8.map(t => t.name);
  const data = top8.map(t => t.count || 0);
  if (otherCount > 0) {
    labels.push('其他');
    data.push(otherCount);
  }

  const colors = top8.map(t => {
    const type = getToolType(t.name);
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
            font: { size: 12 },
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 8,
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

  if (!skills || skills.length === 0) return;

  const sorted = [...skills].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 10);
  const labels = sorted.map(s => s.name || s.skill || '未知');
  const data = sorted.map(s => s.count || 0);

  const colors = getChartColors();
  const ctx = canvas.getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: '#6366f1',
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
      },
      scales: {
        x: {
          grid: { color: colors.grid },
          ticks: { color: colors.text, font: { size: 11 } },
        },
        y: {
          grid: { display: false },
          ticks: { color: colors.text, font: { size: 12 } },
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
