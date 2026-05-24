/**
 * App Entry - Application initialization entry
 * Binds global events, initializes theme, registers page routing.
 * Features: global search overlay (Ctrl+K)
 */

import { initTheme, cycleTheme } from './theme';
import { switchPage, registerPageInit, initializeActivePage } from './router';
import { ipcClient } from '../services/ipc-client';

// Page modules - must be imported so esbuild includes them and their registerPageInit side effects run
import '../pages/home/index';
import '../pages/files/index';
import '../pages/ai/index';
import '../pages/todo/index';
import '../pages/settings/index';

/** Global AI stats */
export const aiStats = { tokens: 0, requests: 0 };

async function initApp(): Promise<void> {
  initTheme();
  bindTitleBarEvents();
  bindNavEvents();
  bindKeyboardShortcuts();
  bindSearchOverlay();
  loadAIStats();
  setGreeting();
  registerPageInits();
  initializeActivePage();
  initSidebarCollapse();
  console.log('[App] \u521D\u59CB\u5316\u5B8C\u6210');
}

function setGreeting(): void {
  const el = document.getElementById('home-greeting');
  if (!el) return;
  const hour = new Date().getHours();
  let greeting = '\u4F60\u597D';
  if (hour < 6) greeting = '\u591C\u6DF1\u4E86';
  else if (hour < 9) greeting = '\u65E9\u4E0A\u597D';
  else if (hour < 12) greeting = '\u4E0A\u5348\u597D';
  else if (hour < 14) greeting = '\u4E2D\u5348\u597D';
  else if (hour < 18) greeting = '\u4E0B\u5348\u597D';
  else if (hour < 22) greeting = '\u665A\u4E0A\u597D';
  else greeting = '\u591C\u6DF1\u4E86';
  el.textContent = greeting + ' \uD83D\uDC4B';
}

function bindTitleBarEvents(): void {
  document.getElementById('btn-min')?.addEventListener('click', () => ipcClient.window.minimize());
  document.getElementById('btn-max')?.addEventListener('click', () => ipcClient.window.maximize());
  document.getElementById('btn-close')?.addEventListener('click', () => ipcClient.window.close());
  document.getElementById('btn-theme')?.addEventListener('click', cycleTheme);
}

function bindNavEvents(): void {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = (item as HTMLElement).dataset.page;
      if (page) switchPage(page as any);
    });
  });
}

function bindKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      const em = (window as any).__editorManager;
      if (em) em.saveFile();
    }
    if (e.ctrlKey && e.key === 'o') {
      e.preventDefault();
      switchPage('files');
      setTimeout(() => {
        const ft = (window as any).__fileTree;
        if (ft) ft.openFolder();
      }, 200);
    }
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      switchPage('files');
      setTimeout(() => { (window as any).__handleNewFile?.(); }, 200);
    }
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      const em = (window as any).__editorManager;
      if (em?.activeEditor) em.closeTab(em.activeEditor);
    }
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      toggleSearchOverlay();
    }
  });
}

// --- Global Search Overlay ---

function toggleSearchOverlay(): void {
  const overlay = document.getElementById('global-search-overlay');
  if (!overlay) return;
  if (overlay.classList.contains('active')) {
    closeSearchOverlay();
  } else {
    openSearchOverlay();
  }
}

function openSearchOverlay(): void {
  const overlay = document.getElementById('global-search-overlay');
  if (!overlay) return;
  overlay.classList.add('active');
  const input = document.getElementById('global-search-input') as HTMLInputElement;
  if (input) {
    input.value = '';
    input.focus();
  }
  renderSearchResults('');
}

function closeSearchOverlay(): void {
  const overlay = document.getElementById('global-search-overlay');
  overlay?.classList.remove('active');
}

function renderSearchResults(query: string): void {
  const container = document.getElementById('global-search-results');
  if (!container) return;

  if (!query.trim()) {
    container.innerHTML =
      '<div class="search-section">' +
        '<div class="search-section-title">\u5FEB\u6377\u64CD\u4F5C</div>' +
        '<div class="search-item" data-action="page" data-page="home"><span class="search-item-icon">\uD83C\uDFE0</span><span>\u9996\u9875</span></div>' +
        '<div class="search-item" data-action="page" data-page="files"><span class="search-item-icon">\uD83D\uDCC1</span><span>\u6587\u4EF6\u7BA1\u7406</span></div>' +
        '<div class="search-item" data-action="page" data-page="ai"><span class="search-item-icon">\uD83E\uDD16</span><span>AI \u52A9\u624B</span></div>' +
        '<div class="search-item" data-action="page" data-page="todo"><span class="search-item-icon">\u2705</span><span>\u5F85\u529E\u4E2D\u5FC3</span></div>' +
        '<div class="search-item" data-action="page" data-page="settings"><span class="search-item-icon">\u2699\uFE0F</span><span>\u8BBE\u7F6E</span></div>' +
        '<div class="search-item" data-action="open-folder"><span class="search-item-icon">\uD83D\uDCC2</span><span>\u6253\u5F00\u6587\u4EF6\u5939</span></div>' +
      '</div>';
    bindSearchResultClicks(container);
    return;
  }

  const store = (window as any).__filesStore;
  const tabs = store?.getState()?.openTabs || [];
  const q = query.toLowerCase();
  const matchingTabs = tabs.filter((p: string) => p.toLowerCase().includes(q));

  let html = '';
  if (matchingTabs.length > 0) {
    html += '<div class="search-section"><div class="search-section-title">\u6253\u5F00\u7684\u6587\u4EF6</div>';
    for (const tab of matchingTabs) {
      const name = tab.split(/[/\\]/).pop() || tab;
      html += '<div class="search-item" data-action="file" data-path="' + escAttr(tab) + '">' +
        '<span class="search-item-icon">\uD83D\uDCC4</span>' +
        '<span class="search-item-name">' + escHTML(name) + '</span>' +
        '<span class="search-item-path">' + escHTML(tab) + '</span></div>';
    }
    html += '</div>';
  }

  const actions = [
    { page: 'home', label: '\u9996\u9875', icon: '\uD83C\uDFE0' },
    { page: 'files', label: '\u6587\u4EF6\u7BA1\u7406', icon: '\uD83D\uDCC1' },
    { page: 'ai', label: 'AI \u52A9\u624B', icon: '\uD83E\uDD16' },
    { page: 'todo', label: '\u5F85\u529E\u4E2D\u5FC3', icon: '\u2705' },
    { page: 'settings', label: '\u8BBE\u7F6E', icon: '\u2699\uFE0F' },
    { page: 'files', label: '\u6253\u5F00\u6587\u4EF6\u5939', icon: '\uD83D\uDCC2', action: 'open-folder' },
  ];

  const matchingActions = actions.filter(a => a.label.toLowerCase().includes(q));
  if (matchingActions.length > 0) {
    html += '<div class="search-section"><div class="search-section-title">\u64CD\u4F5C</div>';
    for (const a of matchingActions) {
      html += '<div class="search-item" data-action="' + (a.action || 'page') + '" data-page="' + a.page + '">' +
        '<span class="search-item-icon">' + a.icon + '</span><span>' + a.label + '</span></div>';
    }
    html += '</div>';
  }

  if (!html) {
    html = '<div class="search-empty">\u6CA1\u6709\u627E\u5230\u5339\u914D\u9879</div>';
  }

  container.innerHTML = html;
  bindSearchResultClicks(container);
}

function bindSearchResultClicks(container: HTMLElement): void {
  container.querySelectorAll('.search-item').forEach(el => {
    el.addEventListener('click', () => {
      const action = (el as HTMLElement).dataset.action;
      const page = (el as HTMLElement).dataset.page;
      const path = (el as HTMLElement).dataset.path;

      closeSearchOverlay();

      if (action === 'file' && path) {
        switchPage('files');
        setTimeout(() => {
          const em = (window as any).__editorManager;
          const name = path.split(/[/\\]/).pop() || path;
          em?.openFile(path, name);
        }, 200);
      } else if (action === 'open-folder') {
        switchPage('files');
        setTimeout(() => {
          (window as any).__fileTree?.openFolder();
        }, 200);
      } else if (page) {
        switchPage(page as any);
      }
    });
  });
}

function bindSearchOverlay(): void {
  document.querySelector('.search-box')?.addEventListener('click', () => {
    toggleSearchOverlay();
  });

  document.getElementById('global-search-input')?.addEventListener('input', (e) => {
    renderSearchResults((e.target as HTMLInputElement).value);
  });

  document.getElementById('global-search-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('global-search-backdrop')) {
      closeSearchOverlay();
    }
  });

  document.getElementById('global-search-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearchOverlay();
  });
}

function escHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function loadAIStats(): void {
  try {
    const saved = localStorage.getItem('ai-stats');
    if (saved) {
      const parsed = JSON.parse(saved);
      aiStats.tokens = parsed.tokens || 0;
      aiStats.requests = parsed.requests || 0;
    }
  } catch { /* ignore */ }
}

function registerPageInits(): void {
  // Pages are initialized lazily when first visited
}


// --- Sidebar Collapse (with localStorage persistence) ---
function initSidebarCollapse(): void {
  const sidebar = document.querySelector('.sidebar');
  const btn = document.getElementById('btn-collapse-sidebar');
  if (!sidebar || !btn) return;
  const saved = localStorage.getItem('sidebar-collapsed');
  if (saved === 'true') { sidebar.classList.add('collapsed'); updateIcon(true); }
  btn.addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebar-collapsed', String(collapsed));
    updateIcon(collapsed);
  });
  function updateIcon(c: boolean) {
    const svg = btn!.querySelector('svg');
    if (!svg) return;
    svg.innerHTML = c
      ? '<path d="m13 17 5-5-5-5"/><path d="m6 17 5-5-5-5"/>'
      : '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>';
    btn!.setAttribute('title', c ? '展开侧边栏' : '收起侧边栏');
  }
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);