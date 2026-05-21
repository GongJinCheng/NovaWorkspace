/**
 * Home Page - index
 * Initializes the real todo summary for the home dashboard.
 */

import { registerPageInit } from '../../app/router';
import { ipcClient } from '../../services/ipc-client';
import { switchPage } from '../../app/router';

async function initHomePage(): Promise<void> {
  await renderTodoSummary();
}

async function renderTodoSummary(): Promise<void> {
  try {
    const data = await ipcClient.todo.load();
    const tasks = data.tasks || [];
    const now = new Date();
    const pending = tasks.filter(t => !t.completed).length;
    const overdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < now).length;
    const today = tasks.filter(t => {
      if (t.completed || !t.dueDate) return false;
      return new Date(t.dueDate).toDateString() === now.toDateString();
    }).length;
    const nextTask = tasks.filter(t => !t.completed).sort((a, b) => {
      const pa = priorityWeight(a.priority);
      const pb = priorityWeight(b.priority);
      if (pa !== pb) return pa - pb;
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return ad - bd;
    })[0] || null;

    setText('home-todo-pending', String(pending));
    setText('home-todo-overdue', String(overdue));
    setText('home-todo-today', String(today));
    setText('home-todo-next', nextTask ? nextTask.title : '暂无待办');
  } catch (err) {
    console.error('[Home] renderTodoSummary failed:', err);
  }
}

function priorityWeight(priority: string) {
  if (priority === 'urgent') return 0;
  if (priority === 'high') return 1;
  if (priority === 'medium') return 2;
  return 3;
}

function setText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

registerPageInit('home', initHomePage);

export { initHomePage };

document.getElementById('btn-go-todo')?.addEventListener('click', () => {
  switchPage('todo');
  setTimeout(() => {
    const target = document.getElementById('todo-bucket-today') || document.getElementById('todo-command-bar');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 120);
});
