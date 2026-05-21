/**
 * Todo Store - state management
 * Manages tasks, filters, view modes, and priority helpers.
 */

import type { TodoData, TodoTask, TodoCategory } from '@shared/types/todo';

export const PRI_COLORS: Record<string, string> = {
  low: '#34d399',
  medium: '#60a5fa',
  high: '#fb923c',
  urgent: '#ef4444',
};

export const PRI_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
};

export const CAT_COLORS = [
  '#6366f1', '#34d399', '#fb923c', '#60a5fa',
  '#f472b6', '#a78bfa', '#fbbf24',
];

const PRI_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const PLANBOARD_BUCKETS = ['已逾期', '今天', '明天', '本周', '更后'] as const;

export type FilterType = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed';
export type ViewMode = 'timeline' | 'list';

interface TodoStore {
  data: TodoData;
  currentFilter: FilterType;
  selectedPri: string;
  selectedDuePreset: string;
  selectedCatId: string;
  viewMode: ViewMode;
  showCompletedInMain: boolean;
  selectedTaskId: string;
}

const store: TodoStore = {
  data: { categories: [], tasks: [] },
  currentFilter: 'all',
  selectedPri: 'medium',
  selectedDuePreset: '',
  selectedCatId: '',
  viewMode: 'timeline',
  showCompletedInMain: false,
  selectedTaskId: '',
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

export function setViewMode(view: ViewMode): void {
  store.viewMode = view;
}

export function setShowCompletedInMain(show: boolean): void {
  store.showCompletedInMain = show;
}

export function setSelectedCatId(catId: string): void {
  store.selectedCatId = catId;
}

export function setSelectedTaskId(taskId: string): void {
  store.selectedTaskId = taskId;
}

export function getFilteredTasks(): TodoTask[] {
  const { tasks } = store.data;
  const catFiltered = store.selectedCatId ? tasks.filter(t => t.categoryId === store.selectedCatId) : tasks;
  const now = new Date();
  
  const source = store.showCompletedInMain ? catFiltered : catFiltered.filter(t => !t.completed);

  switch (store.currentFilter) {
    case 'today':
      return source.filter(t => {
        if (!t.dueDate) return false;
        const due = new Date(t.dueDate);
        return due.toDateString() === now.toDateString();
      });
    case 'upcoming':
      return source.filter(t => {
        if (!t.dueDate) return false;
        const due = new Date(t.dueDate);
        const twoHoursLater = new Date(now.getTime() + 2 * 3600000);
        return due > now && due <= twoHoursLater;
      });
    case 'overdue':
      return source.filter(t => t.dueDate && new Date(t.dueDate) < now && !t.completed);
    case 'completed':
      return catFiltered.filter(t => t.completed);
    default:
      return source;
  }
}

function sortTasksByPriorityThenDue(tasks: TodoTask[]): TodoTask[] {
  return [...tasks].sort((a, b) => {
    const pa = PRI_ORDER[a.priority] ?? 2;
    const pb = PRI_ORDER[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;

    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return aDue - bDue;
  });
}

export function getPlanboardGroups(): Map<string, TodoTask[]> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 86400000);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));

  const baseTasks = store.selectedCatId ? store.data.tasks.filter(t => t.categoryId === store.selectedCatId) : store.data.tasks;
  const source = store.showCompletedInMain ? baseTasks : baseTasks.filter(t => !t.completed);
  const sorted = sortTasksByPriorityThenDue(source);
  const groups = new Map<string, TodoTask[]>();

  for (const bucket of PLANBOARD_BUCKETS) {
    groups.set(bucket, []);
  }

  for (const task of sorted) {
    let bucket = '更后';
    if (task.dueDate) {
      const due = new Date(task.dueDate);
      if (due < startOfToday) {
        bucket = '已逾期';
      } else if (due < startOfTomorrow) {
        bucket = '今天';
      } else if (due < new Date(startOfTomorrow.getTime() + 86400000)) {
        bucket = '明天';
      } else if (due < endOfWeek) {
        bucket = '本周';
      }
    }
    groups.get(bucket)!.push(task);
  }

  return groups;
}

export function getNextUpTask(): TodoTask | null {
  const pending = store.data.tasks.filter(t => !t.completed);
  if (pending.length === 0) return null;
  return sortTasksByPriorityThenDue(pending)[0];
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
  const tomorrow = tasks.filter(t => {
    if (t.completed || !t.dueDate) return false;
    const due = new Date(t.dueDate);
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    return due.toDateString() === tomorrowDate.toDateString();
  }).length;

  return { total, completed, overdue, today, tomorrow, pending: total - completed };
}

export function nextCatColor(): string {
  return CAT_COLORS[store.data.categories.length % CAT_COLORS.length];
}
