/**
 * Task Input — 快速任务输入组件
 * 单行输入 + 优先级色点 + 快捷日期 + 分类选择 + 展开详情
 */

import { ipcClient } from '../../services/ipc-client';
import { getStore, setSelectedPri } from './stores/todo.store';
import type { CreateTaskInput } from '@shared/types/todo';

export function initTaskInput(onTaskAdded: () => Promise<void>): void {
  const container = document.getElementById('page-todo');
  if (!container) return;

  // Quick input Enter
  const quickInput = document.getElementById('todo-quick-input') as HTMLInputElement;
  quickInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && quickInput.value.trim()) {
      await addTask(quickInput.value.trim(), onTaskAdded);
      quickInput.value = '';
    }
  });

  // Priority dots
  container.addEventListener('click', (e) => {
    const dot = (e.target as HTMLElement).closest('.todo-pri-dot') as HTMLElement;
    if (dot) {
      const pri = dot.dataset.pri;
      if (pri) {
        setSelectedPri(pri);
        container.querySelectorAll('.todo-pri-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
      }
    }
  });

  // Category pills — toggle active (single select)
  container.addEventListener('click', (e) => {
    const pill = (e.target as HTMLElement).closest('.todo-cat-pill') as HTMLElement;
    if (!pill || pill.classList.contains('todo-cat-pill-add')) return;
    const catId = pill.dataset.catId;
    if (!catId) return;
    container.querySelectorAll('.todo-cat-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
  });

  // Date chips
  container.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('.todo-date-chip') as HTMLElement;
    if (chip) {
      container.querySelectorAll('.todo-date-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      getStore().selectedDuePreset = chip.dataset.due || '';
    }
  });

  // Detail toggle
  document.getElementById('todo-btn-detail')?.addEventListener('click', () => {
    const panel = document.getElementById('todo-detail-panel');
    panel?.classList.toggle('show');
  });
}

async function addTask(title: string, onTaskAdded: () => Promise<void>): Promise<void> {
  const store = getStore();

  const dueDate = resolvePresetDate(store.selectedDuePreset);
  const customDue = (document.getElementById('todo-due-input') as HTMLInputElement)?.value;

  const subtasksText = (document.getElementById('todo-subtasks-input') as HTMLTextAreaElement)?.value || '';
  const subtasks = subtasksText.split('\n').filter(s => s.trim()).map(text => ({
    id: generateId(),
    text: text.trim(),
    done: false,
  }));

  const selectedCat = document.querySelector('.todo-cat-pill.active') as HTMLElement;

  const task: CreateTaskInput = {
    title,
    priority: store.selectedPri as any,
    categoryId: selectedCat?.dataset.catId || '',
    dueDate: customDue || (dueDate ? dueDate.toISOString() : ''),
    subtasks,
    reminded: false,
  };

  await ipcClient.todo.addTask(task);

  // Reset inputs
  const subtasksInput = document.getElementById('todo-subtasks-input') as HTMLTextAreaElement;
  if (subtasksInput) subtasksInput.value = '';
  const dueInput = document.getElementById('todo-due-input') as HTMLInputElement;
  if (dueInput) dueInput.value = '';

  await onTaskAdded();
}

function resolvePresetDate(preset: string): Date | null {
  const now = new Date();
  switch (preset) {
    case '30m': return new Date(now.getTime() + 30 * 60000);
    case '1h': return new Date(now.getTime() + 3600000);
    case '2h': return new Date(now.getTime() + 2 * 3600000);
    case 'today18': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0);
      return d <= now ? new Date(d.getTime() + 86400000) : d;
    }
    case 'tomorrow9':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
    case 'weekend': {
      const daysUntilSat = (6 - now.getDay() + 7) % 7 || 7;
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSat, 10, 0);
    }
    default: return null;
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}