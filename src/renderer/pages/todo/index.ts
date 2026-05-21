/**
 * Todo Page - Entry and Detail Drawer Coordinator
 * Handles filters, view modes, sliding details drawer, auto-saves, and subtask managers.
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

  // If a task is currently selected, re-render drawer details to keep it updated
  const store = getStore();
  if (store.selectedTaskId) {
    renderDrawerContent();
  }
}

async function refreshAll(): Promise<void> {
  await loadData();
  renderAll();
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

      // Update active filter title label in main area
      const activeFilterLabel = document.getElementById('todo-active-filter-label');
      if (activeFilterLabel) {
        const filterLabels: Record<string, string> = {
          all: '全部任务',
          today: '今天的待办',
          upcoming: '即将到来的任务',
          overdue: '已逾期的待办',
          completed: '已完成的任务',
        };
        activeFilterLabel.textContent = filterLabels[btn.dataset.filter] || '全部任务';
      }

      // Reset category selection when smart filter is clicked
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
    toggleCompletedBtn.textContent = store.showCompletedInMain ? '隐藏已完成' : '显示已完成';
  }
}

function updateNavBadge(): void {
  const store = getStore();
  const pending = store.data.tasks.filter(t => !t.completed).length;
  const badge = document.getElementById('todo-nav-badge');
  if (badge) {
    badge.textContent = pending > 0 ? String(pending) : '';
    badge.style.display = pending > 0 ? 'inline-block' : 'none';
  }
}

/* ============================================================
 * Right Details Drawer Controller
 * ============================================================ */

export function openDrawer(taskId: string): void {
  setSelectedTaskId(taskId);
  
  const drawer = document.getElementById('todo-detail-drawer');
  if (drawer) {
    drawer.classList.add('active');
  }

  renderDrawerContent();
  
  // Highlight card as selected immediately in list/board view
  const area = document.getElementById('todo-task-area');
  if (area) {
    area.querySelectorAll('.todo-task-card').forEach(card => {
      const id = (card as HTMLElement).dataset.id;
      card.classList.toggle('selected', id === taskId);
    });
  }
}

export function closeDrawer(): void {
  setSelectedTaskId('');
  
  const drawer = document.getElementById('todo-detail-drawer');
  if (drawer) {
    drawer.classList.remove('active');
  }

  const content = document.getElementById('todo-drawer-content');
  if (content) {
    content.innerHTML = `
      <div class="todo-drawer-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p>选择待办任务以查看或编辑其详细信息</p>
      </div>
    `;
  }

  // Remove select border on active task cards
  const area = document.getElementById('todo-task-area');
  if (area) {
    area.querySelectorAll('.todo-task-card').forEach(card => card.classList.remove('selected'));
  }
}

function renderDrawerContent(): void {
  const content = document.getElementById('todo-drawer-content');
  if (!content) return;

  const store = getStore();
  const task = store.data.tasks.find(t => t.id === store.selectedTaskId);
  if (!task) {
    closeDrawer();
    return;
  }

  // Format categories options
  let catOptions = '<option value="">未分类</option>';
  for (const cat of store.data.categories) {
    catOptions += `<option value="${cat.id}"${cat.id === task.categoryId ? ' selected' : ''}>${esc(cat.name)}</option>`;
  }

  // Format priority options
  const priorities = ['low', 'medium', 'high', 'urgent'];
  const priorityLabels: Record<string, string> = { low: '低', medium: '中', high: '高', urgent: '紧急' };
  let priOptions = '';
  for (const pri of priorities) {
    priOptions += `<option value="${pri}"${pri === task.priority ? ' selected' : ''}>${priorityLabels[pri]}</option>`;
  }

  // Format date for local input
  let formattedDue = '';
  if (task.dueDate) {
    const d = new Date(task.dueDate);
    const pad = (num: number) => String(num).padStart(2, '0');
    formattedDue = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  content.innerHTML = `
    <!-- Title Edit Field -->
    <div class="todo-drawer-field">
      <label class="todo-drawer-field-label">任务名称</label>
      <input type="text" class="todo-drawer-title-input" id="drawer-task-title" value="${esc(task.title)}" placeholder="输入任务名称...">
    </div>

    <!-- Description Edit Field -->
    <div class="todo-drawer-field">
      <label class="todo-drawer-field-label">详细描述 (Notes)</label>
      <textarea class="todo-drawer-desc-textarea" id="drawer-task-desc" placeholder="点击添加任务的说明或备注，失焦后自动保存...">${esc(task.description || '')}</textarea>
    </div>

    <!-- Category & Priority Row -->
    <div class="todo-drawer-row">
      <div class="todo-drawer-field">
        <label class="todo-drawer-field-label">所属分类</label>
        <select class="todo-drawer-select" id="drawer-task-cat">
          ${catOptions}
        </select>
      </div>
      <div class="todo-drawer-field">
        <label class="todo-drawer-field-label">优先级</label>
        <select class="todo-drawer-select" id="drawer-task-pri">
          ${priOptions}
        </select>
      </div>
    </div>

    <!-- Due Date Field -->
    <div class="todo-drawer-field">
      <label class="todo-drawer-field-label">截止时间</label>
      <input type="datetime-local" class="todo-drawer-datetime" id="drawer-task-due" value="${formattedDue}">
    </div>

    <!-- Subtasks checklist field -->
    <div class="todo-drawer-field">
      <label class="todo-drawer-field-label">子任务进度</label>
      <div class="todo-drawer-subtasks" id="drawer-subtasks-list">
        <!-- Rendered dynamically -->
      </div>
      <div class="todo-drawer-add-subtask-row" style="margin-top: 8px;">
        <input type="text" class="todo-drawer-subtask-input" id="drawer-new-subtask-input" placeholder="输入子任务后回车或点击添加...">
        <button class="todo-drawer-add-subtask-btn" id="drawer-btn-add-subtask">添加</button>
      </div>
    </div>
  `;

  bindDrawerInputEvents(task.id);
  renderDrawerSubtasks(task);
}

function renderDrawerSubtasks(task: TodoTask): void {
  const container = document.getElementById('drawer-subtasks-list');
  if (!container) return;

  let html = '';
  const subtasks = task.subtasks || [];
  for (const sub of subtasks) {
    html += `
      <div class="todo-drawer-subtask-item${sub.done ? ' done' : ''}" data-subtask-id="${sub.id}">
        <input type="checkbox" class="todo-drawer-subtask-check" ${sub.done ? 'checked' : ''} data-action="drawer-toggle-subtask">
        <input type="text" class="todo-drawer-subtask-text" value="${esc(sub.text)}" data-action="drawer-edit-subtask" placeholder="编辑子任务...">
        <button class="todo-drawer-subtask-delete" data-action="drawer-delete-subtask" title="删除子任务">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;
  }

  if (subtasks.length === 0) {
    html = '<div style="font-size:12px;color:var(--text-tertiary);font-style:italic;padding:4px 0;">无子任务，在下方快速创建清单</div>';
  }

  container.innerHTML = html;
}

function bindDrawerInputEvents(taskId: string): void {
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
      
      // Auto focus back on new subtask input for fast workflows
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

    // Toggle subtask checkbox
    if (target.closest('[data-action="drawer-toggle-subtask"]')) {
      const subtasks = task.subtasks.map(s => s.id === subtaskId ? { ...s, done: !s.done } : s);
      await ipcClient.todo.updateTask(taskId, { subtasks });
      await refreshAll();
      renderDrawerContent();
      return;
    }

    // Delete subtask
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
          await refreshAll();
          
          // Re-render subtask texts only without replacing full content to maintain edit focus
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
