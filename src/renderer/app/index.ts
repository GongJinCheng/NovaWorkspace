/**
 * App Entry - Application initialization entry
 * Binds global events, initializes theme, registers page routing.
 * Features: global search overlay (Ctrl+K)
 */

import { initTheme, cycleTheme } from './theme';
import { switchPage, registerPageInit, initializeActivePage } from './router';
import { ipcClient } from '../services/ipc-client';
import { showInputPrompt } from '../components/modal';

// Page modules - must be imported so esbuild includes them and their registerPageInit side effects run
import '../pages/home/index';
import '../pages/project';
import '../pages/files/index';
import '../pages/ai/index';
import '../pages/todo/index';
import '../pages/settings/index';

/** Global AI stats */
export const aiStats = { tokens: 0, requests: 0 };

async function initApp(): Promise<void> {
  installElectronDialogSafetyGuards();
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


function installElectronDialogSafetyGuards(): void {
  // Electron 35+ does not support the native browser prompt dialog in renderer.
  // Older cached bundles or third-party snippets may still call window.prompt();
  // prevent the whole AI action from crashing with "prompt() is not supported".
  try {
    window.prompt = ((message?: string, defaultValue?: string) => {
      console.warn('[Nova] Native prompt is disabled in Electron. Message:', message || '');
      return defaultValue || '';
    }) as typeof window.prompt;
  } catch {
    // Ignore read-only environments.
  }
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


// --- Global Search / Command Palette ---

type PaletteResult = {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  icon: string;
  action: () => void | Promise<void>;
};

let paletteResults: PaletteResult[] = [];
let paletteSelectedIndex = 0;
let paletteSearchTimer: ReturnType<typeof setTimeout> | null = null;
let paletteLastQuery = '';

function toggleSearchOverlay(): void {
  const overlay = document.getElementById('global-search-overlay');
  if (!overlay) return;
  overlay.classList.contains('active') ? closeSearchOverlay() : openSearchOverlay();
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
  void renderSearchResults('');
}

function closeSearchOverlay(): void {
  const overlay = document.getElementById('global-search-overlay');
  overlay?.classList.remove('active');
}

async function renderSearchResults(query: string): Promise<void> {
  const container = document.getElementById('global-search-results');
  if (!container) return;
  const q = query.trim();
  paletteLastQuery = q;
  paletteSelectedIndex = 0;

  if (!q) {
    paletteResults = getDefaultPaletteActions();
    renderPaletteSections(container, paletteResults);
    return;
  }

  container.innerHTML = '<div class="search-empty">正在搜索文件、文档内容和待办...</div>';
  const lower = q.toLowerCase();
  const actions = getCommandActions().filter((item) => (item.title + ' ' + (item.subtitle || '')).toLowerCase().includes(lower));
  const todos = await searchTodoResults(lower);
  const files = await searchWorkspaceResults(q).catch((error) => {
    console.warn('[Palette] workspace search failed:', error);
    return [] as PaletteResult[];
  });

  if (paletteLastQuery !== q) return;
  paletteResults = [...actions, ...files, ...todos].slice(0, 80);
  renderPaletteSections(container, paletteResults);
}

function getDefaultPaletteActions(): PaletteResult[] {
  return [
    ...getCommandActions().slice(0, 10),
    { id: 'page-home', group: '页面', title: '首页', subtitle: '回到今日工作台', icon: '🏠', action: () => switchPage('home') },
    { id: 'page-project', group: '页面', title: '项目概览', subtitle: '查看当前工作区状态、统计和项目 AI', icon: '📊', action: () => switchPage('project') },
    { id: 'page-files', group: '页面', title: '文件管理', subtitle: '浏览和编辑工作区文件', icon: '📁', action: () => switchPage('files') },
    { id: 'page-ai', group: '页面', title: 'AI 助手', subtitle: '打开 AI 对话与配置侧栏', icon: '🤖', action: () => switchPage('ai') },
    { id: 'page-todo', group: '页面', title: '待办中心', subtitle: '查看和管理任务', icon: '✅', action: () => switchPage('todo') },
    { id: 'page-settings', group: '页面', title: '设置', subtitle: '模型、主题和快捷键', icon: '⚙️', action: () => switchPage('settings') },
  ];
}

function getCommandActions(): PaletteResult[] {
  return [
    { id: 'cmd-open-folder', group: '命令', title: '打开工作区', subtitle: '选择一个本地文件夹作为项目', icon: '📂', action: () => { switchPage('files'); setTimeout(() => (window as any).__fileTree?.openFolder?.() || (window as any).__chooseWorkspaceFolder?.(), 200); } },
    { id: 'cmd-project-overview', group: '命令', title: '打开项目概览', subtitle: '查看当前工作区统计和动态', icon: '📊', action: () => switchPage('project') },
    { id: 'cmd-new-file', group: '命令', title: '新建文档', subtitle: '在当前工作区创建 Markdown 或其他文件', icon: '📝', action: () => { switchPage('files'); setTimeout(() => (window as any).__handleNewFile?.(), 200); } },
    { id: 'cmd-new-todo', group: '命令', title: '新建待办', subtitle: '快速创建一条任务', icon: '➕', action: createQuickTodo },
    { id: 'cmd-settings', group: '命令', title: '打开设置', subtitle: '配置 AI Provider、主题和快捷键', icon: '⚙️', action: () => switchPage('settings') },
    { id: 'cmd-ai', group: '命令', title: '打开 AI 助手', subtitle: '进入 AI 对话页', icon: '🤖', action: () => switchPage('ai') },
    { id: 'cmd-ai-summary', group: 'AI 命令', title: 'AI 总结当前文档', subtitle: '基于当前 Markdown 生成总结', icon: '✨', action: () => runActiveMarkdownCommand('summary') },
    { id: 'cmd-ai-todo', group: 'AI 命令', title: 'AI 根据当前文档生成待办', subtitle: '从当前 Markdown 提取任务', icon: '✅', action: () => runActiveMarkdownCommand('todo') },
    { id: 'cmd-ask-doc', group: 'AI 命令', title: '问当前文档', subtitle: '基于当前 Markdown 向 AI 提问', icon: '💬', action: () => runActiveMarkdownCommand('askdoc') },
    { id: 'cmd-save-version', group: '文档命令', title: '保存当前版本', subtitle: '为当前文档创建历史版本', icon: '🕘', action: () => runActiveMarkdownCommand('saveversion') },
    { id: 'cmd-history', group: '文档命令', title: '查看版本历史', subtitle: '预览、恢复或删除历史版本', icon: '📚', action: () => runActiveMarkdownCommand('history') },
  ];
}

async function searchTodoResults(lowerQuery: string): Promise<PaletteResult[]> {
  try {
    const data = await ipcClient.todo.load();
    const matched = (data.tasks || [])
      .filter((task) => (task.title + ' ' + (task.description || '')).toLowerCase().includes(lowerQuery))
      .sort((a, b) => Number(a.completed) - Number(b.completed))
      .slice(0, 20);
    return matched.map((task) => ({
      id: 'todo-' + task.id,
      group: '待办',
      title: task.title,
      subtitle: (task.completed ? '已完成' : '未完成') + ' · ' + priorityLabel(task.priority) + (task.sourceTitle ? ' · 来源：' + task.sourceTitle : ''),
      icon: task.completed ? '☑️' : '✅',
      action: async () => {
        switchPage('todo');
        setTimeout(() => { void (window as any).__openTodoTask?.(task.id); }, 250);
      },
    }));
  } catch {
    return [];
  }
}

async function searchWorkspaceResults(query: string): Promise<PaletteResult[]> {
  const root = getCurrentWorkspaceRoot();
  if (!root) return [];
  const results = await ipcClient.fs.searchWorkspace({ rootPath: root, query, limit: 50 });
  return results.map((item, index) => ({
    id: item.type + '-' + index + '-' + item.path,
    group: item.type === 'content' ? '文档内容' : '文件',
    title: item.name,
    subtitle: item.type === 'content'
      ? `第 ${item.line || 1} 行 · ${item.snippet || item.path}`
      : relativePath(root, item.path),
    icon: item.type === 'content' ? '🔎' : fileIcon(item.name),
    action: () => openFileFromPalette(item.path),
  }));
}

function getCurrentWorkspaceRoot(): string {
  const store = (window as any).__filesStore;
  const root = store?.getWorkspaceRoot?.() || store?.getState?.()?.workspaceRoot || '';
  return typeof root === 'string' ? root : '';
}

function openFileFromPalette(filePath: string): void {
  switchPage('files');
  setTimeout(() => {
    const openFilePath = (window as any).__openFilePath;
    if (typeof openFilePath === 'function') void openFilePath(filePath);
  }, 220);
}

function runActiveMarkdownCommand(action: string): void {
  switchPage('files');
  setTimeout(() => {
    const em = (window as any).__editorManager;
    if (!em?.activeEditor) {
      alert('请先在文件管理器中打开一个 Markdown 文档');
      return;
    }
    void em.runMarkdownCommand?.(action);
  }, 220);
}

async function createQuickTodo(): Promise<void> {
  const title = await showInputPrompt('新建待办', '输入任务标题');
  if (!title?.trim()) return;
  await ipcClient.todo.addTask({
    title: title.trim().slice(0, 80),
    description: '',
    priority: 'medium',
    categoryId: '',
    dueDate: '',
    subtasks: [],
    reminded: false,
    sourceType: 'manual',
  });
  window.dispatchEvent(new CustomEvent('nova:todo-data-changed'));
  switchPage('todo');
  setTimeout(() => (window as any).__focusTodoQuickInput?.(), 250);
}

function renderPaletteSections(container: HTMLElement, results: PaletteResult[]): void {
  if (results.length === 0) {
    container.innerHTML = '<div class="search-empty">没有找到匹配项</div>';
    return;
  }
  const groups = new Map<string, PaletteResult[]>();
  for (const item of results) {
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group)!.push(item);
  }

  let globalIndex = 0;
  container.innerHTML = Array.from(groups.entries()).map(([group, items]) => {
    const rows = items.map((item) => {
      const index = globalIndex++;
      return '<div class="search-item command-palette-item' + (index === paletteSelectedIndex ? ' selected' : '') + '" data-index="' + index + '">' +
        '<span class="search-item-icon">' + escHTML(item.icon) + '</span>' +
        '<span class="search-item-main"><span class="search-item-name">' + escHTML(item.title) + '</span>' +
        (item.subtitle ? '<span class="search-item-subtitle">' + escHTML(item.subtitle) + '</span>' : '') + '</span>' +
      '</div>';
    }).join('');
    return '<div class="search-section"><div class="search-section-title">' + escHTML(group) + '</div>' + rows + '</div>';
  }).join('') + '<div class="search-footer">↑↓ 选择 · Enter 执行 · Esc 关闭</div>';

  bindSearchResultClicks(container);
}

function bindSearchResultClicks(container: HTMLElement): void {
  container.querySelectorAll('.search-item').forEach(el => {
    el.addEventListener('mouseenter', () => {
      paletteSelectedIndex = Number((el as HTMLElement).dataset.index || 0);
      updatePaletteSelection();
    });
    el.addEventListener('click', () => executePaletteResult(Number((el as HTMLElement).dataset.index || 0)));
  });
}

function executePaletteResult(index: number): void {
  const item = paletteResults[index];
  if (!item) return;
  closeSearchOverlay();
  void item.action();
}

function updatePaletteSelection(): void {
  const items = Array.from(document.querySelectorAll('.command-palette-item')) as HTMLElement[];
  items.forEach((item, index) => item.classList.toggle('selected', index === paletteSelectedIndex));
  items[paletteSelectedIndex]?.scrollIntoView({ block: 'nearest' });
}

function bindSearchOverlay(): void {
  document.querySelector('.search-box')?.addEventListener('click', () => toggleSearchOverlay());

  document.getElementById('global-search-input')?.addEventListener('input', (e) => {
    const value = (e.target as HTMLInputElement).value;
    if (paletteSearchTimer) clearTimeout(paletteSearchTimer);
    paletteSearchTimer = setTimeout(() => { void renderSearchResults(value); }, value.trim() ? 180 : 0);
  });

  document.getElementById('global-search-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('global-search-backdrop')) closeSearchOverlay();
  });

  document.getElementById('global-search-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSearchOverlay(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      paletteSelectedIndex = paletteResults.length ? (paletteSelectedIndex + 1) % paletteResults.length : 0;
      updatePaletteSelection();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      paletteSelectedIndex = paletteResults.length ? (paletteSelectedIndex - 1 + paletteResults.length) % paletteResults.length : 0;
      updatePaletteSelection();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      executePaletteResult(paletteSelectedIndex);
    }
  });
}

function priorityLabel(priority: string): string {
  return ({ urgent: '紧急', high: '高优先级', medium: '中优先级', low: '低优先级' } as Record<string, string>)[priority] || priority;
}

function fileIcon(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.md')) return 'MD';
  if (lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.js')) return 'TS';
  if (lower.endsWith('.json')) return '{}';
  return '📄';
}

function relativePath(root: string, fullPath: string): string {
  return fullPath.replace(root, '').replace(/^[/\\]/, '') || fullPath;
}

function escHTML(str: string): string {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(str: string): string {
  return escHTML(str).replace(/"/g, '&quot;');
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