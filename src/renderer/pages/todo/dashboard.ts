/**
 * Dashboard — 统计仪表盘
 * 显示今日进度、任务统计
 */

import { getStore, getStats } from './stores/todo.store';

export function renderDashboard(): void {
  const stats = getStats();
  const store = getStore();

  // Calculate upcoming (due within 2 hours, not overdue)
  const now = new Date();
  const twoHours = new Date(now.getTime() + 2 * 3600000);
  const upcoming = store.data.tasks.filter(t => {
    if (t.completed || !t.dueDate) return false;
    const due = new Date(t.dueDate);
    return due > now && due <= twoHours;
  }).length;

  setTextSafe('todo-num-overdue', String(stats.overdue));
  setTextSafe('todo-num-today', String(stats.today));
  setTextSafe('todo-num-upcoming', String(upcoming));
  setTextSafe('todo-num-done', String(stats.completed));

  renderRingChart(stats);
}

function renderRingChart(stats: { total: number; completed: number }): void {
  const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (pct / 100) * circumference;

  const ringFill = document.getElementById('todo-ring-fill');
  if (ringFill) {
    ringFill.setAttribute('stroke-dasharray', String(circumference));
    ringFill.setAttribute('stroke-dashoffset', String(offset));
    ringFill.style.stroke = pct > 0 ? '#34d399' : 'var(--text-tertiary)';
    ringFill.style.transition = 'stroke-dashoffset 0.5s ease';
  }

  const ringLabel = document.getElementById('todo-ring-label');
  if (ringLabel) ringLabel.textContent = pct + '%';

  const ringSub = document.getElementById('todo-ring-sub');
  if (ringSub) ringSub.textContent = stats.completed + '/' + stats.total + ' 项';
}

function setTextSafe(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}