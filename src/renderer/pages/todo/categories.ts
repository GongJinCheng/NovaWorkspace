/**
 * Categories - 分类管理
 */

import { ipcClient } from '../../services/ipc-client';
import { getStore, nextCatColor } from './stores/todo.store';
import { showInputPrompt } from '../../components/modal';
import type { TodoCategory } from '@shared/types/todo';

export function renderCategories(onRefresh: () => Promise<void>): void {
  const pills = document.getElementById('todo-cat-pills');
  if (!pills) return;

  const store = getStore();
  let html = '<span class="todo-cat-pill todo-cat-pill-add" data-action="add-cat">+ 新分类</span>';

  for (const cat of store.data.categories) {
    html += '<span class="todo-cat-pill" data-cat-id="' + cat.id + '" style="border-color:' + cat.color + ';color:' + cat.color + '">' +
      esc(cat.name) +
      '<button class="todo-cat-remove" data-action="remove-cat" data-cat-id="' + cat.id + '">&times;</button>' +
    '</span>';
  }

  pills.innerHTML = html;
  bindCategoryEvents(pills, onRefresh);
}

function bindCategoryEvents(pills: HTMLElement, onRefresh: () => Promise<void>): void {
  pills.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    if (target.closest('[data-action="add-cat"]')) {
      const name = await showInputPrompt('新建分类', '请输入分类名称');
      if (name?.trim()) {
        const color = nextCatColor();
        await ipcClient.todo.addCategory({ name: name.trim(), color });
        await onRefresh();
      }
    }

    const removeBtn = target.closest('[data-action="remove-cat"]') as HTMLElement;
    if (removeBtn) {
      const catId = removeBtn.dataset.catId;
      if (catId && confirm('确定删除此分类？')) {
        await ipcClient.todo.deleteCategory(catId);
        await onRefresh();
      }
    }
  });
}

function esc(text: string): string {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}