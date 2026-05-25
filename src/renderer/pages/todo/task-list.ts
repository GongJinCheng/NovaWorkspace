/**
 * Task List - delegated events and optimistic updates
 * One click listener is bound for the whole task area. This prevents event
 * listener accumulation after repeated renders, which was a major lag source.
 */

import { ipcClient } from '../../services/ipc-client';
import { measure } from '../../utils/performance';
import {
  getStore,
  getFilteredTasks,
  getPlanboardGroups,
  getTaskById,
  getCategoryById,
  removeTaskFromStore,
  updateTaskInStore,
  PRI_COLORS,
  PRI_LABELS,
  PLANBOARD_BUCKETS,
} from './stores/todo.store';
import type { TodoTask } from '@shared/types/todo';

let currentRefresh: () => Promise<void> = async () => {};
let currentSelectTask: ((id: string) => void) | undefined;
let boundTaskArea: HTMLElement | null = null;
let inlineCommitInProgress = false;

export function renderTaskList(onRefresh: () => Promise<void>, onSelectTask?: (id: string) => void): void {
  const area = document.getElementById('todo-task-area');
  if (!area) return;

  currentRefresh = onRefresh;
  currentSelectTask = onSelectTask;
  ensureTaskEventsBound(area);

  measure('todo.renderTaskList', () => {
    const store = getStore();
    if (store.viewMode === 'timeline') {
      renderPlanboard(area);
    } else {
      renderListView(area);
    }
  });
}

function renderPlanboard(area: HTMLElement): void {
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

    for (const task of bucketTasks) html += renderTaskCard(task);

    if (bucketTasks.length === 0) html += '<div class="todo-bucket-empty">暂无任务</div>';
    html += '</div></div>';
  }
  html += '</div>';

  area.innerHTML = hasAnyTask ? html : renderEmptyState(getStore().currentFilter);
}

function renderListView(area: HTMLElement): void {
  const tasks = getFilteredTasks();

  if (tasks.length === 0) {
    area.innerHTML = renderEmptyState(getStore().currentFilter);
    return;
  }

  let html = '<div class="todo-group">' +
    '<div class="todo-group-header">' +
      '<span class="todo-group-label">当前任务</span>' +
      '<span class="todo-group-count">' + tasks.length + '</span>' +
    '</div>';

  for (const task of tasks) html += renderTaskCard(task);
  html += '</div>';

  area.innerHTML = html;
}

function renderTaskCard(task: TodoTask): string {
  const priColor = PRI_COLORS[task.priority] || PRI_COLORS.medium;
  const dueInfo = formatDueDate(task.dueDate);
  const cat = task.categoryId ? getCategoryById(task.categoryId) : undefined;
  const subtasksDone = task.subtasks?.filter((s: { done: boolean }) => s.done).length || 0;
  const subtasksTotal = task.subtasks?.length || 0;
  const isSelected = getStore().selectedTaskId === task.id;

  return '<div class="todo-task-card ' + (task.completed ? 'completed' : '') + (isSelected ? ' selected' : '') + '" data-id="' + task.id + '">' +
    '<div class="todo-task-pri-bar" style="background:' + priColor + '"></div>' +
    '<div class="todo-task-body">' +
      '<div class="todo-task-header">' +
        '<button class="todo-check-btn ' + (task.completed ? 'checked' : '') + '" data-action="toggle" data-id="' + task.id + '">' +
          (task.completed ? CHECK_ICON : '') +
        '</button>' +
        '<span class="todo-task-title ' + (task.completed ? 'strike' : '') + '" data-action="inline-edit" data-id="' + task.id + '">' + esc(task.title) + '</span>' +
        '<div class="todo-task-actions">' +
          '<button class="todo-action-btn" data-action="delete" data-id="' + task.id + '" title="删除">' + DELETE_ICON + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="todo-task-meta">' +
        (dueInfo ? '<span class="todo-due-badge ' + dueInfo.cls + '">' + dueInfo.text + '</span>' : '') +
        (cat ? '<span class="todo-cat-tag" style="color:' + cat.color + '">' + esc(cat.name) + '</span>' : '') +
        '<span class="todo-pri-tag" style="color:' + priColor + '">' + PRI_LABELS[task.priority] + '</span>' +
        (subtasksTotal > 0 ? '<span class="todo-subtask-count" data-action="toggle-subtasks" data-id="' + task.id + '" title="展开子任务">' + subtasksDone + '/' + subtasksTotal + '</span>' : '') +
      '</div>' +
      (subtasksTotal > 0 ? renderSubtasks(task) : '') +
    '</div>' +
  '</div>';
}

function renderSubtasks(task: TodoTask): string {
  if (!task.subtasks || task.subtasks.length === 0) return '';
  let html = '<div class="todo-subtasks" data-subtasks-of="' + task.id + '">';
  for (const sub of task.subtasks) {
    html += '<div class="todo-subtask-item ' + (sub.done ? 'done' : '') + '">' +
      '<button class="todo-subtask-check ' + (sub.done ? 'checked' : '') + '" data-action="toggle-subtask" data-id="' + task.id + '" data-subtask-id="' + sub.id + '">' +
        (sub.done ? SMALL_CHECK_ICON : '') +
      '</button>' +
      '<span class="todo-subtask-text ' + (sub.done ? 'strike' : '') + '">' + esc(sub.text) + '</span>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

function ensureTaskEventsBound(area: HTMLElement): void {
  if (boundTaskArea === area) return;

  boundTaskArea = area;
  area.addEventListener('click', handleTaskAreaClick);
}

async function handleTaskAreaClick(e: MouseEvent): Promise<void> {
  const area = e.currentTarget as HTMLElement;
  const target = e.target as HTMLElement;
  const actionBtn = target.closest('[data-action]') as HTMLElement | null;

  if (actionBtn) {
    e.stopPropagation();
    const action = actionBtn.dataset.action;
    const id = actionBtn.dataset.id || actionBtn.dataset.taskId;
    if (!id) return;

    if (action === 'toggle') {
      await toggleTask(id, actionBtn);
    } else if (action === 'delete') {
      await deleteTask(id);
    } else if (action === 'toggle-subtasks') {
      const subtasksEl = area.querySelector('[data-subtasks-of="' + id + '"]') as HTMLElement | null;
      if (subtasksEl) subtasksEl.classList.toggle('show');
    } else if (action === 'toggle-subtask') {
      const subtaskId = actionBtn.dataset.subtaskId;
      if (subtaskId) await toggleSubtask(id, subtaskId, actionBtn);
    } else if (action === 'inline-edit') {
      startInlineEdit(actionBtn);
    }
    return;
  }

  const card = target.closest('.todo-task-card') as HTMLElement | null;
  if (card) {
    const taskId = card.dataset.id;
    if (taskId && currentSelectTask) currentSelectTask(taskId);
  }
}

async function toggleTask(taskId: string, actionBtn: HTMLElement): Promise<void> {
  const task = getTaskById(taskId);
  if (!task) return;

  const previousCompleted = task.completed;
  const previousCompletedAt = task.completedAt;
  const completed = !previousCompleted;
  const completedAt = completed ? new Date().toISOString() : undefined;

  updateTaskInStore(taskId, { completed, completedAt });
  patchTaskCardCompletion(actionBtn, completed);

  try {
    await ipcClient.todo.updateTask(taskId, { completed, completedAt });
    await currentRefresh();
  } catch (err) {
    console.error('[Todo] Toggle failed, rolling back:', err);
    updateTaskInStore(taskId, { completed: previousCompleted, completedAt: previousCompletedAt });
    await currentRefresh();
  }
}

async function deleteTask(taskId: string): Promise<void> {
  const previousTask = getTaskById(taskId);
  const card = document.querySelector('.todo-task-card[data-id="' + taskId + '"]');
  if (card) card.remove();
  removeTaskFromStore(taskId);

  try {
    await ipcClient.todo.deleteTask(taskId);
    await currentRefresh();
  } catch (err) {
    console.error('[Todo] Delete failed, refreshing:', err, previousTask);
    await currentRefresh();
  }
}

async function toggleSubtask(taskId: string, subtaskId: string, actionBtn: HTMLElement): Promise<void> {
  const task = getTaskById(taskId);
  const subtask = task?.subtasks?.find(s => s.id === subtaskId);
  if (!task || !subtask) return;

  const rollbackSubtasks = task.subtasks.map(s => ({ ...s }));
  const nextSubtasks = task.subtasks.map(s => s.id === subtaskId ? { ...s, done: !s.done } : s);
  updateTaskInStore(taskId, { subtasks: nextSubtasks });
  patchSubtask(actionBtn, nextSubtasks.find(s => s.id === subtaskId)?.done || false, nextSubtasks);

  try {
    await ipcClient.todo.updateTask(taskId, { subtasks: nextSubtasks });
    await currentRefresh();
  } catch (err) {
    console.error('[Todo] Subtask toggle failed, rolling back:', err);
    updateTaskInStore(taskId, { subtasks: rollbackSubtasks });
    await currentRefresh();
  }
}

function startInlineEdit(titleEl: HTMLElement): void {
  const id = titleEl.dataset.id;
  if (!id) return;

  const task = getTaskById(id);
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
    if (inlineCommitInProgress) return;
    inlineCommitInProgress = true;

    const next = input.value.trim();
    if (!next) {
      await currentRefresh();
      inlineCommitInProgress = false;
      return;
    }

    if (next !== task.title) {
      const oldTitle = task.title;
      updateTaskInStore(id, { title: next });
      titleEl.textContent = next;
      input.replaceWith(titleEl);

      try {
        await ipcClient.todo.updateTask(id, { title: next });
      } catch (err) {
        console.error('[Todo] Inline edit failed, rolling back:', err);
        updateTaskInStore(id, { title: oldTitle });
        await currentRefresh();
      }
    } else {
      input.replaceWith(titleEl);
    }

    inlineCommitInProgress = false;
  };

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await commit();
    } else if (e.key === 'Escape') {
      await currentRefresh();
    }
  });

  input.addEventListener('blur', commit);
}

function patchTaskCardCompletion(actionBtn: HTMLElement, completed: boolean): void {
  const card = actionBtn.closest('.todo-task-card');
  if (!card) return;

  if (completed) {
    card.classList.add('completing');
    setTimeout(() => {
      card.classList.add('completed');
      card.classList.remove('completing');
    }, 220);
  } else {
    card.classList.remove('completed', 'completing');
  }

  actionBtn.classList.toggle('checked', completed);
  actionBtn.innerHTML = completed ? CHECK_ICON : '';
  card.querySelector('.todo-task-title')?.classList.toggle('strike', completed);
}

function patchSubtask(actionBtn: HTMLElement, done: boolean, subtasks: TodoTask['subtasks']): void {
  const subtaskEl = actionBtn.closest('.todo-subtask-item');
  if (subtaskEl) {
    subtaskEl.classList.toggle('done', done);
    actionBtn.classList.toggle('checked', done);
    actionBtn.innerHTML = done ? SMALL_CHECK_ICON : '';
    subtaskEl.querySelector('.todo-subtask-text')?.classList.toggle('strike', done);
  }

  const parentCard = actionBtn.closest('.todo-task-card');
  const countEl = parentCard?.querySelector('.todo-subtask-count');
  if (countEl) {
    const doneCount = subtasks.filter(s => s.done).length;
    countEl.textContent = doneCount + '/' + subtasks.length;
  }
}


function bucketId(bucket: string): string {
  const map: Record<string, string> = {
    '已逾期': 'overdue',
    '今天': 'today',
    '明天': 'tomorrow',
    '本周': 'week',
    '更后': 'later',
  };
  return map[bucket] || bucket;
}

function formatDueDate(dueDate: string) {
  if (!dueDate) return null;
  const diff = new Date(dueDate).getTime() - Date.now();
  const abs = Math.abs(diff);

  if (diff < 0) {
    if (abs < 60000) return { text: '刚刚逾期', cls: 'overdue' };
    if (abs < 3600000) return { text: '逾期 ' + Math.round(abs / 60000) + ' 分钟', cls: 'overdue' };
    if (abs < 86400000) return { text: '逾期 ' + Math.round(abs / 3600000) + ' 小时', cls: 'overdue' };
    return { text: '逾期 ' + Math.round(abs / 86400000) + ' 天', cls: 'overdue' };
  }
  if (diff < 60000) return { text: '不到 1 分钟', cls: 'soon' };
  if (diff < 3600000) return { text: Math.round(diff / 60000) + ' 分钟后', cls: 'soon' };
  if (diff < 86400000) return { text: Math.round(diff / 3600000) + ' 小时后', cls: '' };
  return { text: Math.round(diff / 86400000) + ' 天后', cls: '' };
}

function renderEmptyState(filter: string): string {
  const messages: Record<string, string> = {
    all: '还没有任务，添加一个吧！',
    today: '今天没有待办任务',
    upcoming: '暂无即将到来的任务',
    overdue: '太棒了！没有逾期任务',
    completed: '还没有完成的任务',
  };
  return '<div class="todo-empty-state">' +
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' +
    '<p>' + (messages[filter] || messages.all) + '</p>' +
  '</div>';
}

function esc(text: string): string {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

const CHECK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
const SMALL_CHECK_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
const DELETE_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
