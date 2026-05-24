/**
 * Categories - 分类管理与过滤组件
 */

import { ipcClient } from '../../services/ipc-client';
import { getStore, setSelectedCatId, setFilter, nextCatColor } from './stores/todo.store';
import { showInputPrompt, showModal } from '../../components/modal';
import type { TodoCategory } from '@shared/types/todo';

export function renderCategories(onFilterRefresh: () => Promise<void>, onFullRefresh: () => Promise<void>): void {
  renderSidebar(onFilterRefresh, onFullRefresh);
  renderQuickAddPills();
}

function renderSidebar(onFilterRefresh: () => Promise<void>, onFullRefresh: () => Promise<void>): void {
  const sidebarCategories = document.getElementById('todo-sidebar-categories');
  if (!sidebarCategories) return;

  const store = getStore();
  const selectedCatId = store.selectedCatId;

  // Render smart filter counts
  updateSmartFilterCounts();

  let html = '';
  for (const cat of store.data.categories) {
    const isActive = cat.id === selectedCatId;
    const count = store.data.tasks.filter(t => t.categoryId === cat.id && !t.completed).length;

    html += `
      <div class="todo-sidebar-cat-item${isActive ? ' active' : ''}" data-action="filter-cat" data-cat-id="${cat.id}">
        <span class="todo-cat-color-dot" style="background:${cat.color}"></span>
        <span class="todo-cat-name" style="color:${cat.color}">${esc(cat.name)}</span>
        <span class="todo-cat-count">${count}</span>
        <button class="todo-sidebar-cat-delete" data-action="remove-cat" data-cat-id="${cat.id}" title="删除分类">&times;</button>
      </div>
    `;
  }

  if (store.data.categories.length === 0) {
    html = '<div style="font-size:12px;color:var(--text-tertiary);padding:10px 12px;font-style:italic;">暂无分类</div>';
  }

  sidebarCategories.innerHTML = html;
  bindSidebarEvents(sidebarCategories, onFilterRefresh, onFullRefresh);
}

function renderQuickAddPills(): void {
  const pillsContainer = document.getElementById('todo-cat-pills');
  if (!pillsContainer) return;

  let html = '<span class="todo-cat-pill todo-cat-pill-add" data-action="add-cat-quick" title="快捷新建分类">+ 新分类</span>';

  const store = getStore();
  for (const cat of store.data.categories) {
    html += `
      <span class="todo-cat-pill" data-cat-id="${cat.id}" style="border-color:${cat.color};color:${cat.color}">
        ${esc(cat.name)}
      </span>
    `;
  }

  pillsContainer.innerHTML = html;
}

function updateSmartFilterCounts(): void {
  const store = getStore();
  const tasks = store.data.tasks;
  const now = new Date();

  const countAll = tasks.filter(t => !t.completed).length;
  const countToday = tasks.filter(t => {
    if (t.completed || !t.dueDate) return false;
    return new Date(t.dueDate).toDateString() === now.toDateString();
  }).length;
  const countUpcoming = tasks.filter(t => {
    if (t.completed || !t.dueDate) return false;
    const due = new Date(t.dueDate);
    return due > now && due <= new Date(now.getTime() + 2 * 3600000);
  }).length;
  const countOverdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < now).length;
  const countCompleted = tasks.filter(t => t.completed).length;

  setCountSafe('todo-sidebar-count-all', countAll);
  setCountSafe('todo-sidebar-count-today', countToday);
  setCountSafe('todo-sidebar-count-upcoming', countUpcoming);
  setCountSafe('todo-sidebar-count-overdue', countOverdue);
  setCountSafe('todo-sidebar-count-completed', countCompleted);
}

function setCountSafe(id: string, count: number): void {
  const el = document.getElementById(id);
  if (el) el.textContent = String(count);
}

function bindSidebarEvents(container: HTMLElement, onFilterRefresh: () => Promise<void>, onFullRefresh: () => Promise<void>): void {
  container.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    // Remove category
    const removeBtn = target.closest('[data-action="remove-cat"]') as HTMLElement;
    if (removeBtn) {
      e.stopPropagation();
      const catId = removeBtn.dataset.catId;
      if (catId) {
        showModal({
          title: '删除分类',
          content: '<p>确定要删除这个分类吗？删除后不会影响已有任务。</p>',
          actions: [
            { label: '取消', type: 'secondary', onClick: () => {} },
            { label: '删除', type: 'danger', onClick: async () => { 
                await ipcClient.todo.deleteCategory(catId); 
                const store = getStore();
                if (store.selectedCatId === catId) {
                  setSelectedCatId('');
                }
                await onFullRefresh(); 
              } 
            },
          ],
        });
      }
      return;
    }

    // Filter category
    const catItem = target.closest('[data-action="filter-cat"]') as HTMLElement;
    if (catItem) {
      const catId = catItem.dataset.catId || '';
      const store = getStore();
      const newCatId = store.selectedCatId === catId ? '' : catId;
      setSelectedCatId(newCatId);

      // Clear smart filter and update UI when switching to category
      if (newCatId) {
        setFilter('all');
        const pageTodo = container.closest('#page-todo');
        if (pageTodo) {
          pageTodo.querySelectorAll('.todo-filter-item').forEach((b: Element) => {
            b.classList.toggle('active', b.getAttribute('data-filter') === 'all');
          });
        }
      }

      // Update label in workstation workspace
      const activeFilterLabel = document.getElementById('todo-active-filter-label');
      if (activeFilterLabel) {
        if (newCatId) {
          const cat = store.data.categories.find(c => c.id === newCatId);
          activeFilterLabel.textContent = cat ? `分类: ${cat.name}` : '全部任务';
        } else {
          activeFilterLabel.textContent = '全部任务';
        }
      }

      onFilterRefresh();
    }
  });
}

export function initCategoryToolbar(onRefresh: () => Promise<void>): void {
  const bindAddAction = async () => {
    const name = await showInputPrompt('新建分类', '请输入分类名称');
    if (name?.trim()) {
      const color = nextCatColor();
      await ipcClient.todo.addCategory({ name: name.trim(), color });
      await onRefresh();
    }
  };

  const btnSidebar = document.getElementById('todo-sidebar-add-cat');
  btnSidebar?.addEventListener('click', bindAddAction);

  const workstation = document.querySelector('.todo-workstation');
  workstation?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-action="add-cat-quick"]')) {
      e.stopPropagation();
      await bindAddAction();
    }
  });
}

function esc(text: string): string {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}