/**
 * Task List - delegated events and optimistic updates
 * One click listener is bound for the whole task area. This prevents event
 * listener accumulation after repeated renders, which was a major lag source.
 */

import { ipcClient } from '../../services/ipc-client';
import { measure } from '../../utils/performance';
import { escHtml } from '../../utils/escape';
import { showUndoToast } from '../../widgets/toast';
import {
  getStore,
  getFilteredTasks,
  getPlanboardGroups,
  getTaskById,
  getCategoryById,
  getCategoryOpenCounts,
  removeTaskFromStore,
  updateTaskInStore,
  PRI_COLORS,
  PRI_LABELS,
  PLANBOARD_BUCKETS,
} from './stores/todo.store';
import type { TodoTask } from '@shared/types/todo';

// ── 撤销栈 ──────────────────────────────────────────────────────────────────

type UndoEntry =
  | { type: 'delete'; task: TodoTask }
  | { type: 'complete'; taskId: string; previousCompleted: boolean; previousCompletedAt?: string };

const MAX_UNDO_STACK = 10;
const undoStack: UndoEntry[] = [];

function pushUndo(entry: UndoEntry): void {
  undoStack.push(entry);
  if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
}

async function undoLastAction(): Promise<void> {
  const entry = undoStack.pop();
  if (!entry) return;

  if (entry.type === 'delete') {
    try {
      await ipcClient.todo.addTask(entry.task as any);
      await currentRefresh();
    } catch (err) {
      console.error('[Todo] Undo delete failed:', err);
    }
  } else if (entry.type === 'complete') {
    try {
      await ipcClient.todo.updateTask(entry.taskId, {
        completed: entry.previousCompleted,
        completedAt: entry.previousCompletedAt,
      });
      updateTaskInStore(entry.taskId, {
        completed: entry.previousCompleted,
        completedAt: entry.previousCompletedAt,
      });
      await currentRefresh();
    } catch (err) {
      console.error('[Todo] Undo complete failed:', err);
    }
  }
}

let currentRefresh: () => Promise<void> = async () => {};
let currentSelectTask: ((id: string) => void) | undefined;
let boundTaskArea: HTMLElement | null = null;
let boundTimelineList: HTMLElement | null = null;
let inlineCommitInProgress = false;

export function renderTaskList(onRefresh: () => Promise<void>, onSelectTask?: (id: string) => void): void {
  const area = document.getElementById('todo-task-area');
  if (!area) return;

  currentRefresh = onRefresh;
  currentSelectTask = onSelectTask;
  ensureTaskEventsBound(area);
  ensureTimelineEventsBound();

  measure('todo.renderTaskList', () => {
    const store = getStore();
    area.dataset.view = store.viewMode;
    if (store.viewMode === 'timeline') {
      renderPlanboard(area);
    } else if (store.viewMode === 'board') {
      renderBoardView(area);
    } else {
      renderListView(area);
    }
  });
}

/** Render recently completed tasks into the timeline list at the bottom. */
export function renderCompletedTasks(): void {
  const list = document.getElementById('todo-timeline-list');
  if (!list) return;

  const tasks = getStore().data.tasks;
  const completed = tasks
    .filter(t => t.completed)
    .sort((a, b) => {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 10);

  if (completed.length === 0) {
    list.innerHTML = '<div class="todo-timeline-empty">暂无最近完成的任务</div>';
    return;
  }

  let html = '';
  for (const task of completed) {
    const cat = task.categoryId ? getCategoryById(task.categoryId) : undefined;
    html += '<div class="todo-timeline-item" data-id="' + task.id + '" title="' + escHtml(task.title) + '">' +
      '<span class="todo-timeline-check">' + SMALL_CHECK_ICON + '</span>' +
      '<span class="todo-timeline-title">' + escHtml(task.title) + '</span>' +
      (cat ? '<span class="todo-timeline-cat" style="color:' + cat.color + '">' + escHtml(cat.name) + '</span>' : '') +
    '</div>';
  }
  list.innerHTML = html;
}

function renderPlanboard(area: HTMLElement): void {
  const groups = getPlanboardGroups();
  let hasAnyTask = false;

  let html = '<div class="timeline-container">';
  for (const bucket of PLANBOARD_BUCKETS) {
    const bucketTasks = groups.get(bucket) || [];
    hasAnyTask = hasAnyTask || bucketTasks.length > 0;

    const dotClass = BUCKET_DOT_CLASS[bucket] || 'later';

    html += '<div class="timeline-group' + (bucketTasks.length === 0 ? ' empty' : '') + '" data-group="' + dotClass + '">' +
      '<div class="timeline-dot ' + dotClass + '"></div>' +
      '<div class="group-header" data-action="toggle-group" data-bucket="' + escHtml(bucket) + '">' +
        '<div class="group-title">' +
          '<span class="group-label">' + escHtml(bucket) + '</span>' +
          '<span class="count-badge">' + bucketTasks.length + ' 项</span>' +
        '</div>' +
        '<div class="group-toggle">' + CHEVRON_DOWN_ICON + '</div>' +
      '</div>' +
      '<div class="group-cards">';

    for (const task of bucketTasks) html += renderTaskCard(task);

    if (bucketTasks.length === 0) {
      html += '<div class="todo-bucket-empty">' +
        '<span class="todo-bucket-empty-line"></span>' +
        '<span>暂无任务</span>' +
      '</div>';
    }
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

/**
 * Kanban board view: group tasks by category into columns.
 * Uncategorized tasks appear in a dedicated "未分类" column.
 */
function renderBoardView(area: HTMLElement): void {
  const store = getStore();
  const baseTasks = store.currentFilter === 'completed'
    ? store.data.tasks.filter(t => t.completed)
    : store.data.tasks.filter(t => store.showCompletedInMain ? true : !t.completed);

  const catFiltered = store.selectedCatId
    ? baseTasks.filter(t => t.categoryId === store.selectedCatId)
    : baseTasks;

  // Group tasks by category, sorted by sortOrder (desc) then createdAt
  const columns = new Map<string, TodoTask[]>();
  const uncategorized: TodoTask[] = [];

  // Sort tasks: sortOrder desc (nulls last), then priority, then dueDate
  const sortedTasks = [...catFiltered].sort((a, b) => {
    const sa = a.sortOrder ?? 0;
    const sb = b.sortOrder ?? 0;
    if (sa !== sb) return sb - sa;
    return 0;
  });

  for (const task of sortedTasks) {
    if (task.categoryId) {
      if (!columns.has(task.categoryId)) columns.set(task.categoryId, []);
      columns.get(task.categoryId)!.push(task);
    } else {
      uncategorized.push(task);
    }
  }

  if (catFiltered.length === 0) {
    area.innerHTML = renderEmptyState(store.currentFilter);
    return;
  }

  let html = '<div class="kanban-board">';

  // Uncategorized column (always show if there are uncategorized tasks or no categories)
  if (uncategorized.length > 0 || store.data.categories.length === 0) {
    html += renderKanbanColumn('', '未分类', '#888', uncategorized);
  }

  // All category columns (always show, even if empty — standard Kanban behavior)
  for (const cat of store.data.categories) {
    if (store.selectedCatId && cat.id !== store.selectedCatId) continue;
    const colTasks = columns.get(cat.id) || [];
    html += renderKanbanColumn(cat.id, cat.name, cat.color, colTasks);
  }

  html += '</div>';
  area.innerHTML = html;

  // Enforce column scrolling via JS — fix the flex-shrink issue
  requestAnimationFrame(() => {
    area.style.position = 'relative';
    area.style.overflow = 'hidden';

    const board = area.querySelector('.kanban-board') as HTMLElement | null;
    if (!board) return;
    const areaHeight = area.clientHeight;
    if (areaHeight <= 0) return;
    board.style.position = 'absolute';
    board.style.top = '0';
    board.style.left = '0';
    board.style.right = '0';
    board.style.bottom = '0';
    board.style.overflowX = 'auto';
    board.style.overflowY = 'hidden';
    board.style.display = 'flex';

    const columns = board.querySelectorAll<HTMLElement>('.kanban-column');
    columns.forEach(col => {
      col.style.height = board.clientHeight + 'px';
      col.style.display = 'flex';
      col.style.flexDirection = 'column';
      col.style.overflow = 'hidden';

      const body = col.querySelector('.kanban-column-body') as HTMLElement | null;
      if (body) {
        body.style.flex = '1 1 0';
        body.style.minHeight = '0';
        body.style.overflowY = 'auto';
        // CRITICAL: prevent task cards from flex-shrinking
        body.style.display = 'block';
      }
    });

    // Bind drag & drop for kanban
    bindKanbanDragDrop(board);
  });
}

function renderKanbanColumn(catId: string, name: string, color: string, tasks: TodoTask[]): string {
  return '<div class="kanban-column" data-cat-id="' + escAttr(catId) + '">' +
    '<div class="kanban-column-header">' +
      '<span class="kanban-column-dot" style="background:' + escHtml(color) + '"></span>' +
      '<span class="kanban-column-name">' + escHtml(name) + '</span>' +
      '<span class="kanban-column-count">' + tasks.length + '</span>' +
    '</div>' +
    '<div class="kanban-column-body" data-cat-id="' + escAttr(catId) + '">' +
      (tasks.length > 0
        ? tasks.map(t => renderTaskCard(t)).join('')
        : '<div class="kanban-column-empty">暂无任务</div>') +
    '</div>' +
  '</div>';
}

function renderTaskCard(task: TodoTask): string {
  const priColor = PRI_COLORS[task.priority] || PRI_COLORS.medium;
  const dueInfo = formatDueDate(task.dueDate);
  const cat = task.categoryId ? getCategoryById(task.categoryId) : undefined;
  const subtasksDone = task.subtasks?.filter((s: { done: boolean }) => s.done).length || 0;
  const subtasksTotal = task.subtasks?.length || 0;
  const isSelected = getStore().selectedTaskId === task.id;

  return '<div class="todo-task-card ' + (task.completed ? 'completed' : '') + (isSelected ? ' selected' : '') + '" data-id="' + task.id + '" draggable="true">' +
    '<div class="todo-task-pri-bar" style="background:' + priColor + '"></div>' +
    '<div class="todo-task-body">' +
      '<div class="todo-task-header">' +
        '<button class="todo-check-btn ' + (task.completed ? 'checked' : '') + '" data-action="toggle" data-id="' + task.id + '">' +
          (task.completed ? CHECK_ICON : '') +
        '</button>' +
        '<span class="todo-task-title ' + (task.completed ? 'strike' : '') + '" data-action="inline-edit" data-id="' + task.id + '">' + escHtml(task.title) + '</span>' +
        '<div class="todo-task-actions">' +
          '<button class="todo-action-btn" data-action="delete" data-id="' + task.id + '" title="删除">' + DELETE_ICON + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="todo-task-meta">' +
        (dueInfo ? '<span class="todo-due-badge ' + dueInfo.cls + '">' + dueInfo.text + '</span>' : '') +
        (cat ? '<span class="todo-cat-tag" style="color:' + cat.color + '">' + escHtml(cat.name) + '</span>' : '') +
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
      '<span class="todo-subtask-text ' + (sub.done ? 'strike' : '') + '">' + escHtml(sub.text) + '</span>' +
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

function ensureTimelineEventsBound(): void {
  const list = document.getElementById('todo-timeline-list');
  if (!list || boundTimelineList === list) return;

  boundTimelineList = list;
  list.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const item = target.closest('.todo-timeline-item') as HTMLElement | null;
    if (item) {
      const taskId = item.dataset.id;
      if (taskId && currentSelectTask) currentSelectTask(taskId);
    }
  });
}

async function handleTaskAreaClick(e: MouseEvent): Promise<void> {
  const area = e.currentTarget as HTMLElement;
  const target = e.target as HTMLElement;
  const actionBtn = target.closest('[data-action]') as HTMLElement | null;

  if (actionBtn) {
    e.stopPropagation();
    const action = actionBtn.dataset.action;

    // toggle-group doesn't need a task id — handle it first
    if (action === 'toggle-group') {
      const group = actionBtn.closest('.timeline-group') as HTMLElement | null;
      if (group) group.classList.toggle('collapsed');
      return;
    }

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

  // Push undo entry only when marking as complete (completing is the action to undo)
  if (completed) {
    pushUndo({ type: 'complete', taskId, previousCompleted, previousCompletedAt });
  }

  updateTaskInStore(taskId, { completed, completedAt });
  patchTaskCardCompletion(actionBtn, completed);

  try {
    await ipcClient.todo.updateTask(taskId, { completed, completedAt });
    await currentRefresh();
    if (completed) {
      showUndoToast(`已完成「${task.title.slice(0, 20)}${task.title.length > 20 ? '…' : ''}」`, undoLastAction);
    }
  } catch (err) {
    console.error('[Todo] Toggle failed, rolling back:', err);
    undoStack.pop(); // remove the undo entry we just added since the operation failed
    updateTaskInStore(taskId, { completed: previousCompleted, completedAt: previousCompletedAt });
    await currentRefresh();
  }
}

async function deleteTask(taskId: string): Promise<void> {
  const previousTask = getTaskById(taskId);
  const card = document.querySelector('.todo-task-card[data-id="' + taskId + '"]');
  if (card) card.remove();

  if (previousTask) {
    pushUndo({ type: 'delete', task: { ...previousTask } });
  }

  removeTaskFromStore(taskId);

  try {
    await ipcClient.todo.deleteTask(taskId);
    await currentRefresh();
    if (previousTask) {
      showUndoToast(
        `已删除「${previousTask.title.slice(0, 20)}${previousTask.title.length > 20 ? '…' : ''}」`,
        undoLastAction
      );
    }
  } catch (err) {
    console.error('[Todo] Delete failed, refreshing:', err, previousTask);
    undoStack.pop(); // remove the undo entry since the operation failed
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

const CHECK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
const SMALL_CHECK_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
const DELETE_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
const CHEVRON_DOWN_ICON = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const BUCKET_DOT_CLASS: Record<string, string> = {
  '已逾期': 'overdue',
  '今天': 'today',
  '明天': 'tomorrow',
  '本周': 'week',
  '更后': 'later',
};

// ── 看板拖拽排序 ──

let draggedTaskId: string | null = null;
let draggedFromCatId: string | null = null;

function bindKanbanDragDrop(board: HTMLElement): void {
  const cards = board.querySelectorAll<HTMLElement>('.todo-task-card[draggable="true"]');
  const bodies = board.querySelectorAll<HTMLElement>('.kanban-column-body');

  cards.forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      draggedTaskId = card.dataset.id || null;
      const body = card.closest('.kanban-column-body') as HTMLElement | null;
      draggedFromCatId = body?.dataset.catId || '';
      card.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedTaskId || '');
      }
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      draggedTaskId = null;
      draggedFromCatId = null;
      // Clean up visual indicators
      board.querySelectorAll('.kanban-column-body').forEach((b) => {
        b.classList.remove('drag-over');
      });
    });
  });

  bodies.forEach((body) => {
    body.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      body.classList.add('drag-over');
    });

    body.addEventListener('dragleave', (e) => {
      // Only remove if leaving the body entirely, not entering a child
      const related = e.relatedTarget as Node | null;
      if (related && body.contains(related)) return;
      body.classList.remove('drag-over');
    });

    body.addEventListener('drop', async (e) => {
      e.preventDefault();
      body.classList.remove('drag-over');
      const targetCatId = body.dataset.catId || '';
      const taskId = draggedTaskId;
      if (!taskId) return;

      // Determine insertion position within the column
      const afterElement = getDragAfterElement(body, e.clientY);
      const task = getTaskById(taskId);
      if (!task) return;

      const prevCatId = task.categoryId || '';
      const prevSort = task.sortOrder ?? 0;

      // Optimistically update store
      let newSortOrder = Date.now();
      if (afterElement) {
        const afterId = (afterElement as HTMLElement).dataset.id;
        const afterTask = afterId ? getTaskById(afterId) : null;
        if (afterTask) {
          newSortOrder = (afterTask.sortOrder ?? Date.now()) - 1;
        }
      }

      const categoryIdChanged = prevCatId !== targetCatId;
      updateTaskInStore(taskId, {
        categoryId: targetCatId || undefined,
        sortOrder: newSortOrder,
      });

      try {
        await ipcClient.todo.updateTask(taskId, {
          categoryId: targetCatId || undefined,
          sortOrder: newSortOrder,
        });
        await currentRefresh();
      } catch (err) {
        console.error('[Todo] Drag-drop failed, rolling back:', err);
        updateTaskInStore(taskId, { categoryId: prevCatId || undefined, sortOrder: prevSort });
        await currentRefresh();
      }
    });
  });
}

/** Find the element before which the dragged item should be inserted */
function getDragAfterElement(container: HTMLElement, y: number): HTMLElement | null {
  const cards = Array.from(container.querySelectorAll<HTMLElement>('.todo-task-card:not(.dragging)'));
  let closest: HTMLElement | null = null;
  let closestOffset = Number.NEGATIVE_INFINITY;

  for (const card of cards) {
    const box = card.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closestOffset) {
      closestOffset = offset;
      closest = card;
    }
  }
  return closest;
}
