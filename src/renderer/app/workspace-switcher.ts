/**
 * 工作区快速切换器
 * 侧边栏底部下拉按钮，点击展开最近工作区列表，快速切换。
 * 快捷键 Ctrl+Shift+P 唤起。
 */
import { ipcClient } from '../services/ipc-client';
import { getCurrentWorkspaceRoot } from '../services/workspace-context';
import { escHtml, escAttr } from '../utils/escape';
import { switchPage } from './router';

let dropdownEl: HTMLElement | null = null;
let buttonEl: HTMLElement | null = null;
let nameEl: HTMLElement | null = null;
let containerEl: HTMLElement | null = null;
let isDropdownOpen = false;
let isInitialized = false;

interface WorkspaceItem {
  rootPath: string;
  name: string;
  lastOpened: string;
}

/** 初始化工作区切换器 */
export function initWorkspaceSwitcher(): void {
  if (isInitialized) return;
  containerEl = document.getElementById('workspace-switcher');
  buttonEl = document.getElementById('workspace-switcher-btn');
  nameEl = document.getElementById('workspace-switcher-name');
  dropdownEl = document.getElementById('workspace-switcher-dropdown');
  if (!containerEl || !buttonEl || !nameEl || !dropdownEl) return;

  isInitialized = true;

  buttonEl.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  // 点击外部关闭
  document.addEventListener('click', (e) => {
    if (!isDropdownOpen) return;
    if (containerEl && !containerEl.contains(e.target as Node)) {
      closeDropdown();
    }
  });

  // 快捷键 Ctrl+Shift+P
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
      e.preventDefault();
      openDropdown();
    }
    if (e.key === 'Escape' && isDropdownOpen) {
      closeDropdown();
    }
  });

  // 初始更新当前工作区名
  void refreshCurrentName();
}

/** 更新当前工作区名称显示 */
export async function refreshCurrentName(): Promise<void> {
  if (!nameEl) return;
  const currentRoot = getCurrentWorkspaceRoot();
  if (!currentRoot) {
    nameEl.textContent = '未打开工作区';
    return;
  }
  try {
    const projects = await ipcClient.workspace.list();
    const current = projects.find((p) => p.rootPath === currentRoot);
    nameEl.textContent = current?.name || currentRoot.split(/[\\/]/).pop() || '当前工作区';
  } catch {
    nameEl.textContent = '当前工作区';
  }
}

function toggleDropdown(): void {
  if (isDropdownOpen) closeDropdown();
  else openDropdown();
}

async function openDropdown(): Promise<void> {
  if (!dropdownEl || !containerEl || isDropdownOpen) return;
  isDropdownOpen = true;
  containerEl.classList.add('open');
  dropdownEl.hidden = false;
  dropdownEl.innerHTML = '<div style="padding:12px;text-align:center;font-size:12px;color:var(--text-secondary);">加载中...</div>';

  try {
    const projects = await ipcClient.workspace.list();
    const currentRoot = getCurrentWorkspaceRoot();
    renderDropdown(projects, currentRoot);
  } catch {
    if (dropdownEl) {
      dropdownEl.innerHTML = '<div style="padding:12px;text-align:center;font-size:12px;color:var(--red);">读取工作区列表失败</div>';
    }
  }
}

function closeDropdown(): void {
  if (!dropdownEl || !containerEl) return;
  isDropdownOpen = false;
  containerEl.classList.remove('open');
  dropdownEl.hidden = true;
}

function renderDropdown(projects: WorkspaceItem[], currentRoot: string | null): void {
  if (!dropdownEl) return;

  if (projects.length === 0) {
    dropdownEl.innerHTML =
      '<div style="padding:16px;text-align:center;font-size:12px;color:var(--text-secondary);">' +
      '<p style="margin:0 0 8px;">还没有打开过工作区</p>' +
      '<p style="margin:0;opacity:0.6;">点击下方「打开文件夹」开始</p>' +
      '</div>' +
      '<div class="workspace-switcher-divider"></div>' +
      '<div class="workspace-switcher-action" data-action="open-folder">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
      '<span>打开文件夹</span></div>';
    bindActions();
    return;
  }

  const items = projects.map((p) => {
    const isActive = p.rootPath === currentRoot;
    return '<div class="workspace-switcher-item' + (isActive ? ' active' : '') + '" data-path="' + escAttr(p.rootPath) + '">' +
      '<svg class="workspace-switcher-item-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
      '<div class="workspace-switcher-item-info">' +
      '<div class="workspace-switcher-item-name">' + escHtml(p.name) + '</div>' +
      '<div class="workspace-switcher-item-path">' + escHtml(p.rootPath) + '</div>' +
      '</div>' +
      '</div>';
  }).join('');

  dropdownEl.innerHTML =
    items +
    '<div class="workspace-switcher-divider"></div>' +
    '<div class="workspace-switcher-action" data-action="open-folder">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>' +
    '<span>打开其他文件夹...</span></div>';

  bindItems();
  bindActions();
}

function bindItems(): void {
  if (!dropdownEl) return;
  dropdownEl.querySelectorAll<HTMLElement>('.workspace-switcher-item').forEach((item) => {
    item.addEventListener('click', async () => {
      const path = item.dataset.path;
      if (!path) return;
      closeDropdown();
      await switchToWorkspace(path);
    });
  });
}

function bindActions(): void {
  if (!dropdownEl) return;
  dropdownEl.querySelectorAll<HTMLElement>('.workspace-switcher-action').forEach((action) => {
    action.addEventListener('click', () => {
      const act = action.dataset.action;
      closeDropdown();
      if (act === 'open-folder') {
        void openFolderPicker();
      }
    });
  });
}

/** 切换到指定工作区 */
async function switchToWorkspace(rootPath: string): Promise<void> {
  await ipcClient.workspace.open({ rootPath }).catch(() => null);
  await switchPage('files');
  const openWorkspace = window.__openWorkspaceRoot;
  if (typeof openWorkspace === 'function') {
    await openWorkspace(rootPath, { restoreSession: true });
  } else {
    const ft = window.__fileTree;
    const store = window.__filesStore;
    if (ft?.openProjectPath) {
      await ft.openProjectPath(rootPath);
      if (store) store.setWorkspaceRoot(rootPath);
    }
  }
  await refreshCurrentName();
}

/** 打开文件夹选择器 */
async function openFolderPicker(): Promise<void> {
  await switchPage('files');
  const choose = window.__chooseWorkspaceFolder;
  const ft = window.__fileTree;
  if (typeof choose === 'function') {
    await choose();
  } else if (ft?.openFolder) {
    await ft.openFolder();
  }
  await refreshCurrentName();
}
