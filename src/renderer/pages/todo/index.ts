/**
 * Todo Page - Entry and Detail Drawer Coordinator
 * Handles filters, view modes, sliding details drawer, auto-saves, and subtask managers.
 * Performance: debounced refresh to avoid lag on rapid interactions.
 */

import { ipcClient } from '../../services/ipc-client';
import {
  getStore,
  setData,
  setFilter,
  setViewMode,
  setShowCompletedInMain,
  setSelectedCatId,
  setSelectedTaskId,
  PRI_COLORS,
  PRI_LABELS,
  type FilterType,
  type ViewMode,
} from './stores/todo.store';
import { initTaskInput } from './task-input';
import { renderTaskList } from './task-list';
import { renderCommandBar } from './dashboard';
import { renderCategories, initCategoryToolbar } from './categories';
import { startReminderCheck } from './reminders';
import { registerPageInit } from '../../app/router';
import type { TodoTask } from '@shared/types/todo';

let initialized = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

async function initTodoPage(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await loadData();
  renderAll();
  
  initTaskInput(refreshAll);
  initCategoryToolbar(refreshAll);
  bindFilterEvents();
  bindViewControls();
  startReminderCheck();

  // Bind details drawer close trigger
  document.getElementById('todo-drawer-close')?.addEventListener('click', () => {
    closeDrawer();
  });

  // Close drawer when clicking outside it
  const pageTodo = document.getElementById('page-todo');
  if (pageTodo) {
    pageTodo.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const drawer = document.getElementById('todo-detail-drawer');
      if (drawer && drawer.classList.contains('active')) {
        if (drawer.contains(target)) return;
        if (target.closest('.todo-task-card')) return;
        closeDrawer();
      }
    });
  }

  console.log('[Todo] Workstation page initialized');
}

async function loadData(): Promise<void> {
  try {
    const data = await ipcClient.todo.load();
    setData({
      categories: data.categories || [],
      tasks: data.tasks || [],
    });
  } catch (err) {
    console.error('[Todo] loadData failed:', err);
  }
}

function renderAll(): void {
  renderCommandBar();
  renderCategories(refreshAll);
  renderTaskList(refreshAll, openDrawer);
  updateNavBadge();
  syncViewControls();

  const store = getStore();
  if (store.selectedTaskId) {
    renderDrawerContent();
  }
}

/**
 * Full refresh: reload data from IPC then re-render.
 * Used for explicit refresh actions (not rapid interactions).
 */
async function refreshAll(): Promise<void> {
  await loadData();
  renderAll();
}

/**
 * Debounced refresh: batches rapid interactions into a single refresh.
 * Prevents lag when toggling multiple tasks/subtasks quickly.
 */
export function debouncedRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    refreshTimer = null;
    await loadData();
    renderAll();
  }, 200);
}

function bindFilterEvents(): void {
  const container = document.getElementById('page-todo');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.todo-filter-item') as HTMLElement;
    if (btn?.dataset.filter) {
      setFilter(btn.dataset.filter as FilterType);
      container.querySelectorAll('.todo-filter-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const activeFilterLabel = document.getElementById('todo-active-filter-label');
      if (activeFilterLabel) {
        const filterLabels: Record<string, string> = {
          all: '\u5168\u90E8\u4EFB\u52A1',
          today: '\u4ECA\u5929\u7684\u5F85\u529E',
          upcoming: '\u5373\u5C06\u5230\u6765\u7684\u4EFB\u52A1',
          overdue: '\u5DF2\u903E\u671F\u7684\u5F85\u529E',
          completed: '\u5DF2\u5B8C\u6210\u7684\u4EFB\u52A1',
        };
        activeFilterLabel.textContent = filterLabels[btn.dataset.filter] || '\u5168\u90E8\u4EFB\u52A1';
      }

      setSelectedCatId('');
      container.querySelectorAll('.todo-sidebar-cat-item').forEach(c => c.classList.remove('active'));

      renderTaskList(refreshAll, openDrawer);
    }
  });
}

function bindViewControls(): void {
  const container = document.getElementById('page-todo');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const viewBtn = (e.target as HTMLElement).closest('.todo-view-btn') as HTMLElement;
    if (viewBtn?.dataset.view) {
      setViewMode(viewBtn.dataset.view as ViewMode);
      renderAll();
      return;
    }

    const toggleCompletedBtn = (e.target as HTMLElement).closest('.todo-completed-toggle') as HTMLElement;
    if (toggleCompletedBtn) {
      const current = getStore().showCompletedInMain;
      setShowCompletedInMain(!current);
      renderAll();
    }
  });
}

function syncViewControls(): void {
  const store = getStore();
  const container = document.getElementById('page-todo');
  if (!container) return;

  container.querySelectorAll('.todo-view-btn').forEach(btn => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.view === store.viewMode);
  });

  const toggleCompletedBtn = container.querySelector('.todo-completed-toggle') as HTMLElement | null;
  if (toggleCompletedBtn) {
    toggleCompletedBtn.classList.toggle('active', store.showCompletedInMain);
  }
}

function updateNavBadge(): void {
  const badge = document.getElementById('todo-nav-badge');
  if (!badge) return;
  const stats = getStore().data.tasks;
  const pending = stats.filter(t => !t.completed).length;
  badge.textContent = pending > 0 ? String(pending) : '';
}

// Drawer

function openDrawer(taskId: string): void {
  setSelectedTaskId(taskId);
  const drawer = document.getElementById('todo-detail-drawer');
  if (!drawer) return;
  drawer.classList.add('active');
  renderDrawerContent();
}

function closeDrawer(): void {
  setSelectedTaskId('');
  const drawer = document.getElementById('todo-detail-drawer');
  if (!drawer) return;
  drawer.classList.remove('active');
}

function renderDrawerContent(): void {
  const content = document.getElementById('todo-drawer-content');
  if (!content) return;

  const store = getStore();
  const task = store.data.tasks.find(t => t.id === store.selectedTaskId);
  if (!task) {
    content.innerHTML = '<div class="todo-drawer-empty">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
      '<p>\u9009\u62E9\u5F85\u529E\u4EFB\u52A1\u4EE5\u67E5\u770B\u6216\u7F16\u8F91\u5176\u8BE6\u7EC6\u4FE1\u606F</p></div>';
    return;
  }

  const cat = store.data.categories.find(c => c.id === task.categoryId);
  const priColor = PRI_COLORS[task.priority] || PRI_COLORS.medium;

  content.innerHTML =
    '<div class="drawer-field">' +
      '<label>\u6807\u9898</label>' +
      '<input type="text" id="drawer-task-title" class="drawer-input" value="' + esc(task.title) + '" />' +
    '</div>' +
    '<div class="drawer-field">' +
      '<label>\u63CF\u8FF0</label>' +
      '<textarea id="drawer-task-desc" class="drawer-textarea" placeholder="\u6DFB\u52A0\u63CF\u8FF0...">' + esc(task.description || '') + '</textarea>' +
    '</div>' +
    '<div class="drawer-row">' +
      '<div class="drawer-field">' +
        '<label>\u5206\u7C7B</label>' +
        '<select id="drawer-task-cat" class="drawer-select">' +
          '<option value="">\u65E0</option>' +
          store.data.categories.map(c => '<option value="' + c.id + '"' + (c.id === task.categoryId ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') +
        '</select>' +
      '</div>' +
      '<div class="drawer-field">' +
        '<label>\u4F18\u5148\u7EA7</label>' +
        '<select id="drawer-task-pri" class="drawer-select">' +
          Object.entries(PRI_LABELS).map(([k, v]) => '<option value="' + k + '"' + (k === task.priority ? ' selected' : '') + '>' + v + '</option>').join('') +
        '</select>' +
      '</div>' +
    '</div>' +
    '<div class="drawer-field">' +
      '<label>\u622A\u6B62\u65E5\u671F</label>' +
      '<input type="datetime-local" id="drawer-task-due" class="drawer-input" value="' + (task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : '') + '" />' +
    '</div>' +
    '<div class="drawer-field">' +
      '<label>\u5B50\u4EFB\u52A1</label>' +
      '<div id="drawer-subtasks-list" class="drawer-subtasks-list">' +
        renderDrawerSubtasks(task) +
      '</div>' +
      '<div class="drawer-add-subtask">' +
        '<input type="text" id="drawer-new-subtask-input" class="drawer-input" placeholder="\u6DFB\u52A0\u5B50\u4EFB\u52A1..." />' +
        '<button id="drawer-btn-add-subtask" class="drawer-btn-add">\u6DFB\u52A0</button>' +
      '</div>' +
    '</div>';

  bindDrawerEvents(task.id);
}

function renderDrawerSubtasks(task: TodoTask): string {
  if (!task.subtasks || task.subtasks.length === 0) return '<div class="drawer-subtask-empty">\u6682\u65E0\u5B50\u4EFB\u52A1</div>';
  return task.subtasks.map(sub =>
    '<div class="todo-drawer-subtask-item" data-subtask-id="' + sub.id + '">' +
      '<button class="todo-subtask-check ' + (sub.done ? 'checked' : '') + '" data-action="drawer-toggle-subtask">' +
        (sub.done ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' : '') +
      '</button>' +
      '<input type="text" class="todo-subtask-edit-input ' + (sub.done ? 'done' : '') + '" data-action="drawer-edit-subtask" value="' + esc(sub.text) + '" />' +
      '<button class="todo-subtask-delete-btn" data-action="drawer-delete-subtask" title="\u5220\u9664">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
      '</button>' +
    '</div>'
  ).join('');
}

function bindDrawerEvents(taskId: string): void {
  const titleInput = document.getElementById('drawer-task-title') as HTMLInputElement;
  const descTextarea = document.getElementById('drawer-task-desc') as HTMLTextAreaElement;
  const catSelect = document.getElementById('drawer-task-cat') as HTMLSelectElement;
  const priSelect = document.getElementById('drawer-task-pri') as HTMLSelectElement;
  const dueInput = document.getElementById('drawer-task-due') as HTMLInputElement;

  const saveUpdates = async (updates: Partial<TodoTask>) => {
    await ipcClient.todo.updateTask(taskId, updates);
    await refreshAll();
  };

  titleInput?.addEventListener('blur', () => {
    const val = titleInput.value.trim();
    if (val) saveUpdates({ title: val });
  });

  titleInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      titleInput.blur();
    }
  });

  descTextarea?.addEventListener('blur', () => {
    const val = descTextarea.value.trim();
    saveUpdates({ description: val });
  });

  catSelect?.addEventListener('change', () => {
    saveUpdates({ categoryId: catSelect.value });
  });

  priSelect?.addEventListener('change', () => {
    saveUpdates({ priority: priSelect.value as any });
  });

  dueInput?.addEventListener('change', () => {
    const val = dueInput.value;
    saveUpdates({ dueDate: val ? new Date(val).toISOString() : '' });
  });

  // Add new subtask
  const addSubtaskInput = document.getElementById('drawer-new-subtask-input') as HTMLInputElement;
  const addSubtaskBtn = document.getElementById('drawer-btn-add-subtask') as HTMLButtonElement;

  const commitNewSubtask = async () => {
    const text = addSubtaskInput.value.trim();
    if (!text) return;

    const store = getStore();
    const task = store.data.tasks.find(t => t.id === taskId);
    if (task) {
      const subtasks = [...(task.subtasks || [])];
      subtasks.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        text,
        done: false,
      });

      await ipcClient.todo.updateTask(taskId, { subtasks });
      addSubtaskInput.value = '';
      await refreshAll();
      renderDrawerContent();
      document.getElementById('drawer-new-subtask-input')?.focus();
    }
  };

  addSubtaskBtn?.addEventListener('click', commitNewSubtask);
  addSubtaskInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitNewSubtask();
    }
  });

  // Subtasks list actions delegation
  const sublist = document.getElementById('drawer-subtasks-list');
  
  sublist?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const item = target.closest('.todo-drawer-subtask-item') as HTMLElement;
    if (!item) return;

    const subtaskId = item.dataset.subtaskId;
    if (!subtaskId) return;

    const store = getStore();
    const task = store.data.tasks.find(t => t.id === taskId);
    if (!task) return;

    if (target.closest('[data-action="drawer-toggle-subtask"]')) {
      const subtasks = task.subtasks.map(s => s.id === subtaskId ? { ...s, done: !s.done } : s);
      await ipcClient.todo.updateTask(taskId, { subtasks });
      await refreshAll();
      renderDrawerContent();
      return;
    }

    if (target.closest('[data-action="drawer-delete-subtask"]')) {
      const subtasks = task.subtasks.filter(s => s.id !== subtaskId);
      await ipcClient.todo.updateTask(taskId, { subtasks });
      await refreshAll();
      renderDrawerContent();
      return;
    }
  });

  // Save modified subtask text on blur
  sublist?.addEventListener('blur', async (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('[data-action="drawer-edit-subtask"]')) {
      const item = target.closest('.todo-drawer-subtask-item') as HTMLElement;
      const subtaskId = item?.dataset.subtaskId;
      const val = (target as HTMLInputElement).value.trim();

      if (subtaskId && val) {
        const store = getStore();
        const task = store.data.tasks.find(t => t.id === taskId);
        if (task) {
          const subtasks = task.subtasks.map(s => s.id === subtaskId ? { ...s, text: val } : s);
          await ipcClient.todo.updateTask(taskId, { subtasks });
          debouncedRefresh();
          const updatedTask = getStore().data.tasks.find(t => t.id === taskId);
          if (updatedTask) renderDrawerSubtasks(updatedTask);
        }
      }
    }
  }, true);

  sublist?.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('[data-action="drawer-edit-subtask"]') && e.key === 'Enter') {
      (target as HTMLInputElement).blur();
    }
  });
}

function esc(text: string): string {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

export function scrollToTodayBucket(): void {
  const target = document.getElementById('todo-bucket-today') || document.getElementById('todo-command-bar');
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

registerPageInit('todo', initTodoPage);

export { initTodoPage, refreshAll };