/**
 * Task List — 任务列表渲染
 * 渲染任务卡片、处理完成/删除操作
 */

import { ipcClient } from '../../services/ipc-client';
import { getStore, getFilteredTasks, PRI_COLORS, PRI_LABELS } from './stores/todo.store';
import type { TodoTask } from '@shared/types/todo';

export function renderTaskList(onRefresh: () => Promise<void>): void {
  const area = document.getElementById('todo-task-area');
  if (!area) return;

  const tasks = getFilteredTasks();
  const store = getStore();

  if (tasks.length === 0) {
    area.innerHTML = renderEmptyState(store.currentFilter);
    return;
  }

  // Group tasks by date
  const groups = groupTasksByDate(tasks);
  let html = '';

  for (const [label, groupTasks] of groups) {
    html += `<div class="todo-group">
      <div class="todo-group-header">
        <span class="todo-group-label">${esc(label)}</span>
        <span class="todo-group-count">${groupTasks.length}</span>
      </div>`;

    for (const task of groupTasks) {
      html += renderTaskCard(task);
    }

    html += `</div>`;
  }

  area.innerHTML = html;
  bindTaskEvents(area, onRefresh);
}

function renderTaskCard(task: TodoTask): string {
  const priColor = PRI_COLORS[task.priority] || PRI_COLORS.medium;
  const dueInfo = formatDueDate(task.dueDate);
  const cat = getStore().data.categories.find(c => c.id === task.categoryId);
  const subtasksDone = task.subtasks?.filter(s => s.done).length || 0;
  const subtasksTotal = task.subtasks?.length || 0;

  return `<div class="todo-task-card ${task.completed ? 'completed' : ''}" data-id="${task.id}">
    <div class="todo-task-pri-bar" style="background:${priColor}"></div>
    <div class="todo-task-body">
      <div class="todo-task-header">
        <button class="todo-check-btn ${task.completed ? 'checked' : ''}" data-action="toggle" data-id="${task.id}">
          ${task.completed ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
        </button>
        <span class="todo-task-title ${task.completed ? 'strike' : ''}">${esc(task.title)}</span>
        <div class="todo-task-actions">
          <button class="todo-action-btn" data-action="delete" data-id="${task.id}" title="删除">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
      <div class="todo-task-meta">
        ${dueInfo ? `<span class="todo-due-badge ${dueInfo.cls}">${dueInfo.text}</span>` : ''}
        ${cat ? `<span class="todo-cat-tag" style="color:${cat.color}">${esc(cat.name)}</span>` : ''}
        <span class="todo-pri-tag" style="color:${priColor}">${PRI_LABELS[task.priority]}</span>
        ${subtasksTotal > 0 ? `<span class="todo-subtask-count">${subtasksDone}/${subtasksTotal}</span>` : ''}
      </div>
    </div>
  </div>`;
}

function groupTasksByDate(tasks: TodoTask[]): Map<string, TodoTask[]> {
  const groups = new Map<string, TodoTask[]>();
  const now = new Date();
  const today = now.toDateString();
  const tomorrow = new Date(now.getTime() + 86400000).toDateString();

  for (const task of tasks) {
    let label: string;
    if (!task.dueDate) {
      label = '无日期';
    } else {
      const due = new Date(task.dueDate);
      const dueStr = due.toDateString();
      if (dueStr === today) label = '今天';
      else if (dueStr === tomorrow) label = '明天';
      else if (due < now) label = '已逾期';
      else label = '稍后';
    }

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(task);
  }

  return groups;
}

function bindTaskEvents(area: HTMLElement, onRefresh: () => Promise<void>): void {
  area.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement;
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!id) return;

    if (action === 'toggle') {
      const store = getStore();
      const task = store.data.tasks.find(t => t.id === id);
      if (task) {
        await ipcClient.todo.updateTask(id, { completed: !task.completed, completedAt: !task.completed ? new Date().toISOString() : undefined });
        await onRefresh();
      }
    } else if (action === 'delete') {
      await ipcClient.todo.deleteTask(id);
      await onRefresh();
    }
  });
}

function formatDueDate(dueDate: string): { text: string; cls: string } | null {
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
  return `<div class="todo-empty-state">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
    <p>${messages[filter] || messages.all}</p>
  </div>`;
}

function esc(text: string): string {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}
