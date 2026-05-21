/**
 * Task List - 计划看板与列表渲染
 * 支持时间轴与列表视图、卡片详情点击、以及子任务状态同步
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
      html += '<div class="todo-bucket-empty">暂无任务</div>';
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
      '<span class="todo-group-label">当前任务</span>' +
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
          '<button class="todo-action-btn" data-action="delete" data-id="' + task.id + '" title="删除">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
          '</button>' +
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

function renderSubtasks(task: TodoTask) {
  let html = '<div class="todo-subtasks" data-subtasks-of="' + task.id + '">';
  for (const sub of task.subtasks) {
    html += '<label class="todo-subtask-item">' +
      '<input type="checkbox" class="todo-subtask-check" data-action="toggle-subtask" data-task-id="' + task.id + '" data-subtask-id="' + sub.id + '"' + (sub.done ? ' checked' : '') + '>' +
      '<span class="todo-subtask-text' + (sub.done ? ' done' : '') + '">' + esc(sub.text) + '</span>' +
    '</label>';
  }
  html += '</div>';
  return html;
}

function bucketId(bucket: string) {
  if (bucket === '已逾期') return 'overdue';
  if (bucket === '今天') return 'today';
  if (bucket === '明天') return 'tomorrow';
  if (bucket === '本周') return 'week';
  return 'later';
}

function bindTaskEvents(area: HTMLElement, onRefresh: () => Promise<void>, onSelectTask?: (id: string) => void) {
  area.addEventListener('click', async (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // Check if clicked inside a specific action button/checkbox
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
          const card = actionBtn.closest('.todo-task-card');
          if (card && !task.completed) {
            card.classList.add('completing');
            await new Promise(r => setTimeout(r, 220));
          }
          await ipcClient.todo.updateTask(id, { completed: !task.completed, completedAt: !task.completed ? new Date().toISOString() : undefined });
          await onRefresh();
        }
      } else if (action === 'delete') {
        await ipcClient.todo.deleteTask(id);
        await onRefresh();
      } else if (action === 'toggle-subtasks') {
        const subtasksEl = area.querySelector('[data-subtasks-of="' + id + '"]') as HTMLElement | null;
        if (subtasksEl) subtasksEl.classList.toggle('show');
      } else if (action === 'toggle-subtask') {
        const taskId = actionBtn.dataset.taskId;
        const subtaskId = actionBtn.dataset.subtaskId;
        if (taskId && subtaskId) {
          const store = getStore();
          const task = store.data.tasks.find(t => t.id === taskId);
          const subtask = task?.subtasks?.find(s => s.id === subtaskId);
          if (task && subtask) {
            await ipcClient.todo.updateTask(taskId, {
              subtasks: task.subtasks.map(s => s.id === subtaskId ? { ...s, done: !s.done } : s)
            });
            await onRefresh();
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
      await ipcClient.todo.updateTask(id, { title: next });
      await onRefresh();
    } else {
      await onRefresh();
    }
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

function renderEmptyState(filter: string) {
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

function esc(text: string) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}
