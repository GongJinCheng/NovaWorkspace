/**
 * Todo Store - state management and cached selectors
 * Keeps renderer interactions fast by avoiding repeated full-array scans
 * during every paint and every click.
 */

import type { TodoData, TodoTask, TodoCategory, UpdateTaskInput } from '@shared/types/todo';

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
  '#8B8BFF', '#34D399', '#F59E0B', '#6EB5FF',
  '#F472B6', '#A78BFA', '#FBBF24',
];

const PRI_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const PLANBOARD_BUCKETS = ['已逾期', '今天', '明天', '本周', '更后'] as const;

export type FilterType = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed';
export type ViewMode = 'timeline' | 'list' | 'board';

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

export interface TodoStats {
  total: number;
  completed: number;
  overdue: number;
  today: number;
  tomorrow: number;
  pending: number;
}

export interface SmartFilterCounts {
  all: number;
  today: number;
  upcoming: number;
  overdue: number;
  completed: number;
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

let dataVersion = 0;
let taskMapCache: { version: number; map: Map<string, TodoTask> } | null = null;
let categoryMapCache: { version: number; map: Map<string, TodoCategory> } | null = null;
let categoryOpenCountsCache: { version: number; counts: Map<string, number> } | null = null;
let statsCache: { key: string; stats: TodoStats } | null = null;
let smartCountsCache: { key: string; counts: SmartFilterCounts } | null = null;
let filteredTasksCache: { key: string; tasks: TodoTask[] } | null = null;
let planboardCache: { key: string; groups: Map<string, TodoTask[]> } | null = null;
let nextUpCache: { key: string; task: TodoTask | null } | null = null;

export function getStore(): TodoStore { return store; }

export function getDataVersion(): number { return dataVersion; }

export function setData(data: TodoData): void {
  store.data = {
    categories: Array.isArray(data.categories) ? data.categories : [],
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
  };
  markDataChanged();
}

export function setFilter(filter: FilterType): void {
  if (store.currentFilter === filter) return;
  store.currentFilter = filter;
  clearViewCaches();
}

export function setSelectedPri(pri: string): void {
  store.selectedPri = pri;
}

export function setViewMode(view: ViewMode): void {
  if (store.viewMode === view) return;
  store.viewMode = view;
  clearViewCaches();
}

export function setShowCompletedInMain(show: boolean): void {
  if (store.showCompletedInMain === show) return;
  store.showCompletedInMain = show;
  clearViewCaches();
}

export function setSelectedCatId(catId: string): void {
  if (store.selectedCatId === catId) return;
  store.selectedCatId = catId;
  clearViewCaches();
}

export function setSelectedTaskId(taskId: string): void {
  store.selectedTaskId = taskId;
}

export function getTaskById(taskId: string): TodoTask | undefined {
  if (!taskMapCache || taskMapCache.version !== dataVersion) {
    taskMapCache = {
      version: dataVersion,
      map: new Map(store.data.tasks.map(task => [task.id, task])),
    };
  }
  return taskMapCache.map.get(taskId);
}

export function getCategoryById(categoryId: string): TodoCategory | undefined {
  if (!categoryMapCache || categoryMapCache.version !== dataVersion) {
    categoryMapCache = {
      version: dataVersion,
      map: new Map(store.data.categories.map(category => [category.id, category])),
    };
  }
  return categoryMapCache.map.get(categoryId);
}

export function updateTaskInStore(taskId: string, updates: UpdateTaskInput): TodoTask | null {
  const task = getTaskById(taskId);
  if (!task) return null;
  Object.assign(task, updates);
  markDataChanged();
  return task;
}

export function removeTaskFromStore(taskId: string): void {
  const nextTasks = store.data.tasks.filter(task => task.id !== taskId);
  if (nextTasks.length === store.data.tasks.length) return;
  store.data = { ...store.data, tasks: nextTasks };
  if (store.selectedTaskId === taskId) store.selectedTaskId = '';
  markDataChanged();
}

export function addTaskToStore(task: TodoTask): void {
  store.data = { ...store.data, tasks: [...store.data.tasks, task] };
  markDataChanged();
}

export function removeCategoryFromStore(categoryId: string): void {
  const nextCategories = store.data.categories.filter(category => category.id !== categoryId);
  if (nextCategories.length === store.data.categories.length) return;
  store.data = { ...store.data, categories: nextCategories };
  if (store.selectedCatId === categoryId) store.selectedCatId = '';
  markDataChanged();
}

export function addCategoryToStore(category: TodoCategory): void {
  store.data = { ...store.data, categories: [...store.data.categories, category] };
  markDataChanged();
}

/**
 * A task counts as completed when it is explicitly marked done OR all of its
 * subtasks are checked. This lets parent tasks whose subtasks are fully done be
 * treated as completed across stats, filters and the home dashboard.
 */
export function isEffectivelyCompleted(task: TodoTask): boolean {
  if (task.completed) return true;
  if (task.subtasks && task.subtasks.length > 0) {
    return task.subtasks.every(s => s.done);
  }
  return false;
}

export function getFilteredTasks(): TodoTask[] {
  const key = [
    dataVersion,
    store.currentFilter,
    store.selectedCatId,
    store.showCompletedInMain ? 'showCompleted' : 'hideCompleted',
    getMinuteBucket(),
  ].join('|');

  if (filteredTasksCache?.key === key) return filteredTasksCache.tasks;

  const { tasks } = store.data;
  const catFiltered = store.selectedCatId ? tasks.filter(t => t.categoryId === store.selectedCatId) : tasks;
  const now = new Date();
  const source = store.showCompletedInMain ? catFiltered : catFiltered.filter(t => !isEffectivelyCompleted(t));

  let result: TodoTask[];
  switch (store.currentFilter) {
    case 'today':
      result = source.filter(t => {
        if (!t.dueDate) return false;
        const due = new Date(t.dueDate);
        return due.toDateString() === now.toDateString();
      });
      break;
    case 'upcoming':
      result = source.filter(t => {
        if (!t.dueDate) return false;
        const due = new Date(t.dueDate);
        const twoHoursLater = new Date(now.getTime() + 2 * 3600000);
        return due > now && due <= twoHoursLater;
      });
      break;
    case 'overdue':
      result = source.filter(t => t.dueDate && new Date(t.dueDate) < now && !isEffectivelyCompleted(t));
      break;
    case 'completed':
      result = catFiltered.filter(t => isEffectivelyCompleted(t));
      break;
    default:
      result = source;
      break;
  }

  filteredTasksCache = { key, tasks: result };
  return result;
}

export function getPlanboardGroups(): Map<string, TodoTask[]> {
  const key = [
    dataVersion,
    store.selectedCatId,
    store.showCompletedInMain ? 'showCompleted' : 'hideCompleted',
    getMinuteBucket(),
  ].join('|');

  if (planboardCache?.key === key) return planboardCache.groups;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 86400000);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));

  const baseTasks = store.selectedCatId ? store.data.tasks.filter(t => t.categoryId === store.selectedCatId) : store.data.tasks;
  const source = store.showCompletedInMain ? baseTasks : baseTasks.filter(t => !isEffectivelyCompleted(t));
  const sorted = sortTasksByPriorityThenDue(source);
  const groups = new Map<string, TodoTask[]>();

  for (const bucket of PLANBOARD_BUCKETS) groups.set(bucket, []);

  for (const task of sorted) {
    let bucket = '更后';
    if (task.dueDate) {
      const due = new Date(task.dueDate);
      if (due < startOfToday) bucket = '已逾期';
      else if (due < startOfTomorrow) bucket = '今天';
      else if (due < new Date(startOfTomorrow.getTime() + 86400000)) bucket = '明天';
      else if (due < endOfWeek) bucket = '本周';
    }
    groups.get(bucket)!.push(task);
  }

  planboardCache = { key, groups };
  return groups;
}

export function getNextUpTask(): TodoTask | null {
  const key = `${dataVersion}|${getMinuteBucket()}`;
  if (nextUpCache?.key === key) return nextUpCache.task;

  const pending = store.data.tasks.filter(t => !isEffectivelyCompleted(t));
  const task = pending.length === 0 ? null : sortTasksByPriorityThenDue(pending)[0];
  nextUpCache = { key, task };
  return task;
}

export function getStats(): TodoStats {
  const key = `${dataVersion}|${getMinuteBucket()}`;
  if (statsCache?.key === key) return statsCache.stats;

  const tasks = store.data.tasks;
  const total = tasks.length;
  const now = new Date();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);

  let completed = 0;
  let overdue = 0;
  let today = 0;
  let tomorrow = 0;

  for (const task of tasks) {
    if (isEffectivelyCompleted(task)) {
      completed += 1;
      continue;
    }

    if (!task.dueDate) continue;
    const due = new Date(task.dueDate);
    if (due < now) overdue += 1;
    if (due.toDateString() === now.toDateString()) today += 1;
    if (due.toDateString() === tomorrowDate.toDateString()) tomorrow += 1;
  }

  const stats = { total, completed, overdue, today, tomorrow, pending: total - completed };
  statsCache = { key, stats };
  return stats;
}

export function getSmartFilterCounts(): SmartFilterCounts {
  const key = `${dataVersion}|${getMinuteBucket()}`;
  if (smartCountsCache?.key === key) return smartCountsCache.counts;

  const tasks = store.data.tasks;
  const now = new Date();
  const twoHoursLater = new Date(now.getTime() + 2 * 3600000);
  let all = 0;
  let today = 0;
  let upcoming = 0;
  let overdue = 0;
  let completed = 0;

  for (const task of tasks) {
    if (isEffectivelyCompleted(task)) {
      completed += 1;
      continue;
    }

    all += 1;
    if (!task.dueDate) continue;
    const due = new Date(task.dueDate);
    if (due.toDateString() === now.toDateString()) today += 1;
    if (due > now && due <= twoHoursLater) upcoming += 1;
    if (due < now) overdue += 1;
  }

  const counts = { all, today, upcoming, overdue, completed };
  smartCountsCache = { key, counts };
  return counts;
}

export function getCategoryOpenCounts(): Map<string, number> {
  if (categoryOpenCountsCache?.version === dataVersion) return categoryOpenCountsCache.counts;

  const counts = new Map<string, number>();
  for (const task of store.data.tasks) {
    if (task.completed || !task.categoryId) continue;
    counts.set(task.categoryId, (counts.get(task.categoryId) || 0) + 1);
  }

  categoryOpenCountsCache = { version: dataVersion, counts };
  return counts;
}

export function nextCatColor(): string {
  return CAT_COLORS[store.data.categories.length % CAT_COLORS.length];
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

function markDataChanged(): void {
  dataVersion += 1;
  taskMapCache = null;
  categoryMapCache = null;
  categoryOpenCountsCache = null;
  clearViewCaches();
}

function clearViewCaches(): void {
  statsCache = null;
  smartCountsCache = null;
  filteredTasksCache = null;
  planboardCache = null;
  nextUpCache = null;
}

function getMinuteBucket(): number {
  return Math.floor(Date.now() / 60000);
}
