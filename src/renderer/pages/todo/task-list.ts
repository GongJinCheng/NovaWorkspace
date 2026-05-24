/**
 * Task List - Optimized with optimistic updates
 * Supports timeline and list views, card detail click, subtask state sync.
 */

import { ipcClient } from '../../services/ipc-client';
import {
  getStore,
  getFilteredTasks,
  getPlanboardGroups,
  PRI_COLORS,
  PRI_LABELS,
  PLANBOARD_BUCKETS,
} from './stores/todo.store';
import type { TodoTask } from '@shared/types/todo';

export function renderTaskList(onRefresh: () => Promise<void>, onSelectTask?: (id: string) => void): void {
  const area = document.getElementById('todo-task-area');
  if (!area) return;

  const store = getStore();

  if (store.viewMode === 'timeline') {
    renderPlanboard(area, onRefresh, onSelectTask);
  } else {
    renderListView(area, onRefresh, onSelectTask);
  }
}

function renderPlanboard(area: HTMLElement, onRefresh: () => Promise<void>, onSelectTask?: (id: string) => void) {
  const groups = getPlanboardGroups();
  let hasAnyTask = false;

  let html = '<div class="todo-planboard">';
  for (const bucket of PLANBOARD_BUCKETS) {
    const bucketTasks = groups.get(bucket) || [];
    hasAnyTask = hasAnyTask || bucketTasks.length > 0;

    html += '<div class="todo-bucket" id="todo-bucket-' + bucketId(bucket) + '">' +
      '<div class="todo-bucket-header">' +
        '<span class="todo-bucket-label">' + esc(bucket) + '</span>' +
        '<span class="todo-bucket-count">' + bucketTasks.length + '</span>' +
      '</div>' +
      '<div class="todo-bucket-list">';

    for (const task of bucketTasks) {
      html += renderTaskCard(task);
    }

    if (bucketTasks.length === 0) {
      html += '<div class="todo-bucket-empty">\u6682\u65E0\u4EFB\u52A1</div>';
    }

    html += '</div></div>';
  }
  html += '</div>';

  area.innerHTML = hasAnyTask ? html : renderEmptyState(getStore().currentFilter);
  bindTaskEvents(area, onRefresh, onSelectTask);
}

function renderListView(area: HTMLElement, onRefresh: () => Promise<void>, onSelectTask?: (id: string) => void) {
  const tasks = getFilteredTasks();

  if (tasks.length === 0) {
    area.innerHTML = renderEmptyState(getStore().currentFilter);
    return;
  }

  let html = '<div class="todo-group">' +
    '<div class="todo-group-header">' +
      '<span class="todo-group-label">\u5F53\u524D\u4EFB\u52A1</span>' +
      '<span class="todo-group-count">' + tasks.length + '</span>' +
    '</div>';

  for (const task of tasks) {
    html += renderTaskCard(task);
  }

  html += '</div>';

  area.innerHTML = html;
  bindTaskEvents(area, onRefresh, onSelectTask);
}

function renderTaskCard(task: TodoTask) {
  const priColor = PRI_COLORS[task.priority] || PRI_COLORS.medium;
  const dueInfo = formatDueDate(task.dueDate);
  const cat = getStore().data.categories.find(c => c.id === task.categoryId);
  const subtasksDone = task.subtasks?.filter((s: { done: boolean }) => s.done).length || 0;
  const subtasksTotal = task.subtasks?.length || 0;
  const isSelected = getStore().selectedTaskId === task.id;

  return '<div class="todo-task-card ' + (task.completed ? 'completed' : '') + (isSelected ? ' selected' : '') + '" data-id="' + task.id + '">' +
    '<div class="todo-task-pri-bar" style="background:' + priColor + '"></div>' +
    '<div class="todo-task-body">' +
      '<div class="todo-task-header">' +
        '<button class="todo-check-btn ' + (task.completed ? 'checked' : '') + '" data-action="toggle" data-id="' + task.id + '">' +
          (task.completed ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' : '') +
        '</button>' +
        '<span class="todo-task-title ' + (task.completed ? 'strike' : '') + '" data-action="inline-edit" data-id="' + task.id + '">' + esc(task.title) + '</span>' +
        '<div class="todo-task-actions">' +
          '<button class="todo-action-btn" data-action="delete" data-id="' + task.id + '" title="\u5220\u9664">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="todo-task-meta">' +
        (dueInfo ? '<span class="todo-due-badge ' + dueInfo.cls + '">' + dueInfo.text + '</span>' : '') +
        (cat ? '<span class="todo-cat-tag" style="color:' + cat.color + '">' + esc(cat.name) + '</span>' : '') +
        '<span class="todo-pri-tag" style="color:' + priColor + '">' + PRI_LABELS[task.priority] + '</span>' +
        (subtasksTotal > 0 ? '<span class="todo-subtask-count" data-action="toggle-subtasks" data-id="' + task.id + '" title="\u5C55\u5F00\u5B50\u4EFB\u52A1">' + subtasksDone + '/' + subtasksTotal + '</span>' : '') +
      '</div>' +
      (subtasksTotal > 0 ? renderSubtasks(task) : '') +
    '</div>' +
  '</div>';
}

function renderSubtasks(task: TodoTask) {
  if (!task.subtasks || task.subtasks.length === 0) return '';
  let html = '<div class="todo-subtasks" data-subtasks-of="' + task.id + '">';
  for (const sub of task.subtasks) {
    html += '<div class="todo-subtask-item ' + (sub.done ? 'done' : '') + '">' +
      '<button class="todo-subtask-check ' + (sub.done ? 'checked' : '') + '" data-action="toggle-subtask" data-id="' + task.id + '" data-subtask-id="' + sub.id + '">' +
        (sub.done ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' : '') +
      '</button>' +
      '<span class="todo-subtask-text ' + (sub.done ? 'strike' : '') + '">' + esc(sub.text) + '</span>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

function bucketId(bucket: string): string {
  const map: Record<string, string> = {
    '\u5DF2\u903E\u671F': 'overdue',
    '\u4ECA\u5929': 'today',
    '\u660E\u5929': 'tomorrow',
    '\u672C\u5468': 'week',
    '\u66F4\u540E': 'later',
  };
  return map[bucket] || bucket;
}

function bindTaskEvents(area: HTMLElement, onRefresh: () => Promise<void>, onSelectTask?: (id: string) => void): void {
  area.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const actionBtn = target.closest('[data-action]') as HTMLElement | null;
    if (actionBtn) {
      e.stopPropagation();
      const action = actionBtn.dataset.action;
      const id = actionBtn.dataset.id || actionBtn.dataset.taskId;
      if (!id) return;

      if (action === 'toggle') {
        const store = getStore();
        const task = store.data.tasks.find(t => t.id === id);
        if (task) {
          const newCompleted = !task.completed;
          const card = actionBtn.closest('.todo-task-card');

          // Optimistic: update UI immediately
          if (card) {
            if (newCompleted) {
              card.classList.add('completing');
              setTimeout(() => { card.classList.add('completed'); card.classList.remove('completing'); }, 220);
            } else {
              card.classList.remove('completed');
            }
            actionBtn.classList.toggle('checked', newCompleted);
            const checkSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
            actionBtn.innerHTML = newCompleted ? checkSvg : '';
            const titleEl = card.querySelector('.todo-task-title');
            titleEl?.classList.toggle('strike', newCompleted);
          }

          // Optimistic: update local store
          task.completed = newCompleted;
          task.completedAt = newCompleted ? new Date().toISOString() : undefined;

          // Background save
          try {
            await ipcClient.todo.updateTask(id, { completed: newCompleted, completedAt: task.completedAt });
          } catch (err) {
            console.error('[Todo] Toggle failed, rolling back:', err);
            task.completed = !newCompleted;
            task.completedAt = newCompleted ? undefined : task.completedAt;
            await onRefresh();
          }
        }
      } else if (action === 'delete') {
        await ipcClient.todo.deleteTask(id);
        await onRefresh();
      } else if (action === 'toggle-subtasks') {
        const subtasksEl = area.querySelector('[data-subtasks-of="' + id + '"]') as HTMLElement | null;
        if (subtasksEl) subtasksEl.classList.toggle('show');
      } else if (action === 'toggle-subtask') {
        const taskId = actionBtn.dataset.taskId || actionBtn.dataset.id;
        const subtaskId = actionBtn.dataset.subtaskId;
        if (taskId && subtaskId) {
          const store = getStore();
          const task = store.data.tasks.find(t => t.id === taskId);
          const subtask = task?.subtasks?.find(s => s.id === subtaskId);
          if (task && subtask) {
            // Optimistic: update local
            subtask.done = !subtask.done;
            const subtaskEl = actionBtn.closest('.todo-subtask-item');
            if (subtaskEl) {
              subtaskEl.classList.toggle('done', subtask.done);
              actionBtn.classList.toggle('checked', subtask.done);
              const checkSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
              actionBtn.innerHTML = subtask.done ? checkSvg : '';
              const textEl = subtaskEl.querySelector('.todo-subtask-text');
              textEl?.classList.toggle('strike', subtask.done);
            }
            // Update parent count
            const parentCard = actionBtn.closest('.todo-task-card');
            const countEl = parentCard?.querySelector('.todo-subtask-count');
            if (countEl && task.subtasks) {
              const done = task.subtasks.filter(s => s.done).length;
              countEl.textContent = done + '/' + task.subtasks.length;
            }

            try {
              await ipcClient.todo.updateTask(taskId, { subtasks: task.subtasks });
            } catch (err) {
              console.error('[Todo] Subtask toggle failed, rolling back:', err);
              subtask.done = !subtask.done;
              await onRefresh();
            }
          }
        }
      } else if (action === 'inline-edit') {
        startInlineEdit(actionBtn, onRefresh);
      }
      return;
    }

    // Otherwise, check if clicked the task card itself
    const card = target.closest('.todo-task-card') as HTMLElement | null;
    if (card) {
      const taskId = card.dataset.id;
      if (taskId && onSelectTask) {
        onSelectTask(taskId);
      }
    }
  });
}

function startInlineEdit(titleEl: HTMLElement, onRefresh: () => Promise<void>) {
  const id = titleEl.dataset.id;
  if (!id) return;

  const task = getStore().data.tasks.find(t => t.id === id);
  if (!task || task.completed) return;

  const card = titleEl.closest('.todo-task-card');
  if (!card || card.querySelector('.todo-title-edit-input')) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'todo-title-edit-input';
  input.value = task.title;

  titleEl.replaceWith(input);
  input.focus();
  input.selectionStart = input.value.length;

  const commit = async () => {
    const next = input.value.trim();
    if (next && next !== task.title) {
      // Optimistic: update local store immediately
      task.title = next;
      await ipcClient.todo.updateTask(id, { title: next });
    }
    await onRefresh();
  };

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await commit();
    } else if (e.key === 'Escape') {
      await onRefresh();
    }
  });

  input.addEventListener('blur', commit);
}

function formatDueDate(dueDate: string) {
  if (!dueDate) return null;
  const diff = new Date(dueDate).getTime() - Date.now();
  const abs = Math.abs(diff);

  if (diff < 0) {
    if (abs < 60000) return { text: '\u521A\u521A\u903E\u671F', cls: 'overdue' };
    if (abs < 3600000) return { text: '\u903E\u671F ' + Math.round(abs / 60000) + ' \u5206\u949F', cls: 'overdue' };
    if (abs < 86400000) return { text: '\u903E\u671F ' + Math.round(abs / 3600000) + ' \u5C0F\u65F6', cls: 'overdue' };
    return { text: '\u903E\u671F ' + Math.round(abs / 86400000) + ' \u5929', cls: 'overdue' };
  }
  if (diff < 60000) return { text: '\u4E0D\u5230 1 \u5206\u949F', cls: 'soon' };
  if (diff < 3600000) return { text: Math.round(diff / 60000) + ' \u5206\u949F\u540E', cls: 'soon' };
  if (diff < 86400000) return { text: Math.round(diff / 3600000) + ' \u5C0F\u65F6\u540E', cls: '' };
  return { text: Math.round(diff / 86400000) + ' \u5929\u540E', cls: '' };
}

function renderEmptyState(filter: string) {
  const messages: Record<string, string> = {
    all: '\u8FD8\u6CA1\u6709\u4EFB\u52A1\uFF0C\u6DFB\u52A0\u4E00\u4E2A\u5427\uFF01',
    today: '\u4ECA\u5929\u6CA1\u6709\u5F85\u529E\u4EFB\u52A1',
    upcoming: '\u6682\u65E0\u5373\u5C06\u5230\u6765\u7684\u4EFB\u52A1',
    overdue: '\u592A\u68D2\u4E86\uFF01\u6CA1\u6709\u903E\u671F\u4EFB\u52A1',
    completed: '\u8FD8\u6CA1\u6709\u5B8C\u6210\u7684\u4EFB\u52A1',
  };
  return '<div class="todo-empty-state">' +
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' +
    '<p>' + (messages[filter] || messages.all) + '</p>' +
  '</div>';
}

function esc(text: string) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}