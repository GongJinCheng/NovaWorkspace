/**
 * Todo Store — 待办状态管理
 * 管理任务数据、筛选状态、选中状态
 */

import type { TodoData, TodoTask, TodoCategory } from '@shared/types/todo';

/** 优先级颜色 */
export const PRI_COLORS: Record<string, string> = {
  low: '#34d399',
  medium: '#60a5fa',
  high: '#fb923c',
  urgent: '#ef4444',
};

/** 优先级中文标签 */
export const PRI_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
};

/** 分类颜色池 */
export const CAT_COLORS = [
  '#6366f1', '#34d399', '#fb923c', '#60a5fa',
  '#f472b6', '#a78bfa', '#fbbf24',
];

export type FilterType = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed';

interface TodoStore {
  data: TodoData;
  currentFilter: FilterType;
  selectedPri: string;
  selectedDuePreset: string;
}

const store: TodoStore = {
  data: { categories: [], tasks: [] },
  currentFilter: 'all',
  selectedPri: 'medium',
  selectedDuePreset: '',
};

export function getStore(): TodoStore { return store; }

export function setData(data: TodoData): void {
  store.data = data;
}

export function setFilter(filter: FilterType): void {
  store.currentFilter = filter;
}

export function setSelectedPri(pri: string): void {
  store.selectedPri = pri;
}

export function getFilteredTasks(): TodoTask[] {
  const { tasks } = store.data;
  const now = new Date();

  switch (store.currentFilter) {
    case 'today':
      return tasks.filter(t => {
        if (t.completed) return false;
        if (!t.dueDate) return false;
        const due = new Date(t.dueDate);
        return due.toDateString() === now.toDateString();
      });
    case 'upcoming':
      return tasks.filter(t => {
        if (t.completed) return false;
        if (!t.dueDate) return false;
        const due = new Date(t.dueDate);
        const twoHoursLater = new Date(now.getTime() + 2 * 3600000);
        return due > now && due <= twoHoursLater;
      });
    case 'overdue':
      return tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < now);
    case 'completed':
      return tasks.filter(t => t.completed);
    default:
      return tasks.filter(t => !t.completed);
  }
}

export function getStats() {
  const tasks = store.data.tasks;
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const overdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < new Date()).length;
  const today = tasks.filter(t => {
    if (t.completed || !t.dueDate) return false;
    return new Date(t.dueDate).toDateString() === new Date().toDateString();
  }).length;

  return { total, completed, overdue, today, pending: total - completed };
}

export function nextCatColor(): string {
  return CAT_COLORS[store.data.categories.length % CAT_COLORS.length];
}
