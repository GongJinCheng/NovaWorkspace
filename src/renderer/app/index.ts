/**
 * App Entry — 应用初始化入口
 * 绑定全局事件、初始化主题、注册页面路由
 */

import { initTheme, cycleTheme } from './theme';
import { switchPage, registerPageInit, initializeActivePage } from './router';
import { ipcClient } from '../services/ipc-client';

// Page modules — must be imported so esbuild includes them and their registerPageInit side effects run
import '../pages/home/index';
import '../pages/files/index';
import '../pages/ai/index';
import '../pages/todo/index';
import '../pages/settings/index';

/** 全局 AI 统计 */
export const aiStats = { tokens: 0, requests: 0 };

async function initApp(): Promise<void> {
  // 1. 初始化主题
  initTheme();

  // 2. 绑定标题栏事件
  bindTitleBarEvents();

  // 3. 绑定侧边栏导航
  bindNavEvents();

  // 4. 绑定全局快捷键
  bindKeyboardShortcuts();

  // 5. 加载 AI 统计
  loadAIStats();

  // 6. 初始化页面模块（延迟加载）
  registerPageInits();

  // 7. Initialize whichever page is currently active
  initializeActivePage();

  console.log('[App] 初始化完成');
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

  // Home page cards
  document.getElementById('card-file-manager')?.addEventListener('click', () => switchPage('files'));
  document.getElementById('card-ai-assist')?.addEventListener('click', () => switchPage('ai'));
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
  });
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
  // Each page module registers its own init via registerPageInit
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
