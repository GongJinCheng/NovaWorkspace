/**
 * Dashboard - command bar
 * Highlights today focus, next up task, and key metrics.
 */

import { getStore, getStats, getNextUpTask, PRI_COLORS } from './stores/todo.store';

export function renderCommandBar(): void {
  const stats = getStats();
  const store = getStore();
  const nextUp = getNextUpTask();

  const now = new Date();
  const twoHours = new Date(now.getTime() + 2 * 3600000);
  const upcoming = store.data.tasks.filter(t => {
    if (t.completed || !t.dueDate) return false;
    const due = new Date(t.dueDate);
    return due > now && due <= twoHours;
  }).length;

  setTextSafe('todo-num-overdue', String(stats.overdue));
  setTextSafe('todo-num-today', String(stats.today));
  setTextSafe('todo-num-tomorrow', String(stats.tomorrow));
  setTextSafe('todo-num-upcoming', String(upcoming));
  setTextSafe('todo-num-done', String(stats.completed));

  renderRingChart(stats);
  renderNextUp(nextUp);
}

function renderNextUp(task: ReturnType<typeof getNextUpTask> | null) {
  const titleEl = document.getElementById('todo-next-up-title');
  const metaEl = document.getElementById('todo-next-up-meta');
  if (!titleEl || !metaEl) return;

  if (!task) {
    titleEl.textContent = '暂无待办';
    metaEl.textContent = '当前没有需要处理的任务';
    return;
  }

  const priColor = PRI_COLORS[task.priority] || '#60a5fa';
  const dueText = task.dueDate ? formatShortDue(task.dueDate) : '未设置截止时间';

  titleEl.textContent = task.title;
  metaEl.innerHTML = '<span style="color:' + priColor + ';font-weight:600;">' + task.priority + '</span><span>' + dueText + '</span>';
}

function renderRingChart(stats: { total: number; completed: number }) {
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

function formatShortDue(dueDate: string) {
  const diff = new Date(dueDate).getTime() - Date.now();
  if (diff < 0) return '已逾期';
  if (diff < 3600000) return Math.max(1, Math.round(diff / 60000)) + ' 分钟后';
  if (diff < 86400000) return Math.round(diff / 3600000) + ' 小时后';
  return Math.round(diff / 86400000) + ' 天后';
}

function setTextSafe(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
