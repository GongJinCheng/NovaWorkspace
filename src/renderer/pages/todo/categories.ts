/**
 * Categories - 分类管理与过滤组件
 * Uses one delegated sidebar listener to avoid duplicate event handlers after rerender.
 */

import { ipcClient } from '../../services/ipc-client';
import {
  getStore,
  setSelectedCatId,
  setFilter,
  nextCatColor,
  getCategoryOpenCounts,
  getSmartFilterCounts,
  addCategoryToStore,
  removeCategoryFromStore,
} from './stores/todo.store';
import { showInputPrompt, showModal } from '../../components/modal';
import { escHtml } from '../../utils/escape';

let sidebarFilterRefresh: () => Promise<void> = async () => {};
let sidebarFullRefresh: () => Promise<void> = async () => {};
let boundSidebar: HTMLElement | null = null;

export function renderCategories(onFilterRefresh: () => Promise<void>, onFullRefresh: () => Promise<void>): void {
  sidebarFilterRefresh = onFilterRefresh;
  sidebarFullRefresh = onFullRefresh;
  renderSidebar();
  renderQuickAddPills();
}

function renderSidebar(): void {
  const sidebarCategories = document.getElementById('todo-sidebar-categories');
  if (!sidebarCategories) return;

  const store = getStore();
  const selectedCatId = store.selectedCatId;
  const openCounts = getCategoryOpenCounts();

  updateSmartFilterCounts();
  bindSidebarEventsOnce(sidebarCategories);

  let html = '';
  for (const cat of store.data.categories) {
    const isActive = cat.id === selectedCatId;
    const count = openCounts.get(cat.id) || 0;

    html += `
      <div class="todo-sidebar-cat-item${isActive ? ' active' : ''}" data-action="filter-cat" data-cat-id="${cat.id}">
        <span class="todo-cat-color-dot" style="background:${cat.color}"></span>
        <span class="todo-cat-name" style="color:${cat.color}">${escHtml(cat.name)}</span>
        <span class="todo-cat-count">${count}</span>
        <button class="todo-sidebar-cat-delete" data-action="remove-cat" data-cat-id="${cat.id}" title="删除分类">&times;</button>
      </div>
    `;
  }

  if (store.data.categories.length === 0) {
    html = '<div style="font-size:12px;color:var(--text-tertiary);padding:10px 12px;font-style:italic;">暂无分类</div>';
  }

  sidebarCategories.innerHTML = html;
}

function renderQuickAddPills(): void {
  const pillsContainer = document.getElementById('todo-cat-pills');
  if (!pillsContainer) return;

  let html = '<span class="todo-cat-pill todo-cat-pill-add" data-action="add-cat-quick" title="快捷新建分类">+ 新分类</span>';

  const store = getStore();
  for (const cat of store.data.categories) {
    html += `
      <span class="todo-cat-pill" data-cat-id="${cat.id}" style="border-color:${cat.color};color:${cat.color}">
        ${escHtml(cat.name)}
      </span>
    `;
  }

  pillsContainer.innerHTML = html;
}

function updateSmartFilterCounts(): void {
  const counts = getSmartFilterCounts();
  setCountSafe('todo-sidebar-count-all', counts.all);
  setCountSafe('todo-sidebar-count-today', counts.today);
  setCountSafe('todo-sidebar-count-upcoming', counts.upcoming);
  setCountSafe('todo-sidebar-count-overdue', counts.overdue);
  setCountSafe('todo-sidebar-count-completed', counts.completed);
}

function setCountSafe(id: string, count: number): void {
  const el = document.getElementById(id);
  if (el) el.textContent = String(count);
}

function bindSidebarEventsOnce(container: HTMLElement): void {
  if (boundSidebar === container) return;
  boundSidebar = container;
  container.addEventListener('click', handleSidebarClick);
}

async function handleSidebarClick(e: MouseEvent): Promise<void> {
  const target = e.target as HTMLElement;

  const removeBtn = target.closest('[data-action="remove-cat"]') as HTMLElement | null;
  if (removeBtn) {
    e.stopPropagation();
    const catId = removeBtn.dataset.catId;
    if (!catId) return;

    showModal({
      title: '删除分类',
      content: '<p>确定要删除这个分类吗？删除后不会影响已有任务。</p>',
      actions: [
        { label: '取消', type: 'secondary', onClick: () => {} },
        {
          label: '删除',
          type: 'danger',
          onClick: async () => {
            removeCategoryFromStore(catId);
            renderCategories(sidebarFilterRefresh, sidebarFullRefresh);
            await ipcClient.todo.deleteCategory(catId);
            await sidebarFullRefresh();
          },
        },
      ],
    });
    return;
  }

  const catItem = target.closest('[data-action="filter-cat"]') as HTMLElement | null;
  if (!catItem) return;

  const catId = catItem.dataset.catId || '';
  const store = getStore();
  const newCatId = store.selectedCatId === catId ? '' : catId;
  setSelectedCatId(newCatId);

  if (newCatId) {
    setFilter('all');
    const pageTodo = catItem.closest('#page-todo');
    if (pageTodo) {
      pageTodo.querySelectorAll('.todo-filter-item').forEach((b: Element) => {
        b.classList.toggle('active', b.getAttribute('data-filter') === 'all');
      });
    }
  }

  const activeFilterLabel = document.getElementById('todo-active-filter-label');
  if (activeFilterLabel) {
    if (newCatId) {
      const cat = store.data.categories.find(c => c.id === newCatId);
      activeFilterLabel.textContent = cat ? `分类: ${cat.name}` : '全部任务';
    } else {
      activeFilterLabel.textContent = '全部任务';
    }
  }

  renderSidebar();
  await sidebarFilterRefresh();
}

export function initCategoryToolbar(onRefresh: () => Promise<void>): void {
  const bindAddAction = async () => {
    const name = await showInputPrompt('新建分类', '请输入分类名称');
    if (name?.trim()) {
      const color = nextCatColor();
      const category = await ipcClient.todo.addCategory({ name: name.trim(), color });
      addCategoryToStore(category);
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
