/**
 * Todo Page — 待办中心入口
 * 协调所有子模块：输入、列表、仪表盘、分类、提醒
 */

import { ipcClient } from '../../services/ipc-client';
import { getStore, setData, setFilter, type FilterType } from './stores/todo.store';
import { initTaskInput } from './task-input';
import { renderTaskList } from './task-list';
import { renderDashboard } from './dashboard';
import { renderCategories } from './categories';
import { startReminderCheck } from './reminders';
import { registerPageInit } from '../../app/router';

let initialized = false;

async function initTodoPage(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await loadData();
  renderAll();
  initTaskInput(refreshAll);
  bindFilterEvents();
  startReminderCheck();

  console.log('[Todo] 页面初始化');
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
  renderDashboard();
  renderCategories(refreshAll);
  renderTaskList(refreshAll);
  updateNavBadge();
}

async function refreshAll(): Promise<void> {
  await loadData();
  renderAll();
}

function bindFilterEvents(): void {
  const container = document.getElementById('page-todo');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.todo-filter-btn') as HTMLElement;
    if (btn?.dataset.filter) {
      setFilter(btn.dataset.filter as FilterType);
      container.querySelectorAll('.todo-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTaskList(refreshAll);
    }
  });
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

// Register page init
registerPageInit('todo', initTodoPage);

export { initTodoPage, refreshAll };
