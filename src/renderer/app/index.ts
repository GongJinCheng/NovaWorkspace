/**
 * App Entry - Application initialization entry
 * Binds global events, initializes theme, registers page routing.
 * Features: global search overlay (Ctrl+K)
 */

import { initTheme, cycleTheme } from './theme';
import { switchPage, registerPageInit, initHashRouting } from './router';
import { ipcClient, installIpcErrorBoundary } from '../services/ipc-client';
import { showInputPrompt } from '../components/modal';
import { buildTemplateCommandResults } from '../services/template-service';
import { escHtml, escAttr } from '../utils/escape';
import { getGreeting } from '../utils/format';
import { toast } from '../utils/toast';
import { bus, BusEvents } from '../services/bus';
import { getRuntime, setRuntime } from '../services/runtime';
import { initWorkspaceSwitcher } from './workspace-switcher';
import { initOnboarding } from './onboarding';
import { novaIcon, NovaIconName } from '../utils/icons';

// Page modules - must be imported so esbuild includes them and their registerPageInit side effects run
import '../pages/home/index';
import '../pages/project';
import '../pages/files/index';
import '../pages/ai/index';
import '../pages/todo/index';
import '../pages/knowledge/index';
import '../pages/settings/index';

/** Global AI stats */
export const aiStats = { tokens: 0, requests: 0 };

async function initApp(): Promise<void> {
  installElectronDialogSafetyGuards();
  installIpcErrorBoundary();
  initTheme();
  bindTitleBarEvents();
  bindNavEvents();
  bindKeyboardShortcuts();
  bindSearchOverlay();
  loadAIStats();
  setGreeting();
  registerPageInits();
  initHashRouting();
  initSidebarCollapse();
  initWorkspaceSwitcher();
  initLocalLogin();
  initAutoUpdateStatus();
  initOnboarding();
  if (process.env.NODE_ENV !== 'production') console.log('[App] 初始化完成');
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
  el.textContent = getGreeting() + ' \uD83D\uDC4B';
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
      if (page) void switchPage(page as any);
    });
  });
}

let globalShortcutBound = false;

function bindKeyboardShortcuts(): void {
  if (globalShortcutBound) return;
  globalShortcutBound = true;

  const handleGlobalShortcut = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    const isMod = e.ctrlKey || e.metaKey;

    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const pageByKey: Record<string, 'home' | 'project' | 'files' | 'ai' | 'todo'> = { '1': 'home', '2': 'project', '3': 'files', '4': 'ai', '5': 'todo' };
      const targetPage = pageByKey[key];
      if (targetPage) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        void switchPage(targetPage);
      }
      return;
    }

    if (!isMod) return;

    const eventWithFlag = e as KeyboardEvent & { __novaShortcutHandled?: boolean };
    if (eventWithFlag.__novaShortcutHandled) return;

    const consumeShortcut = () => {
      eventWithFlag.__novaShortcutHandled = true;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    // Ctrl+K is Nova's command palette. Bind it in capture phase so it works
    // immediately after startup and is not swallowed by focused inputs/editors.
    if (key === 'k') {
      consumeShortcut();
      openSearchOverlay();
      return;
    }

    if (key === 's') {
      consumeShortcut();
      bus.emit(BusEvents.EditorSave);
      return;
    }

    if (key === 'o') {
      consumeShortcut();
      void (async () => {
        await switchPage('files');
        bus.emit(BusEvents.FileOpenFolder);
      })();
      return;
    }

    if (key === 'n') {
      consumeShortcut();
      void (async () => {
        await switchPage('files');
        bus.emit(BusEvents.FileNew);
      })();
      return;
    }

    if (key === 'w') {
      consumeShortcut();
      bus.emit(BusEvents.EditorCloseActive);
    }
  };

  // 仅挂在 window 捕获阶段即可，避免 document/window 双注册导致逻辑脆弱
  window.addEventListener('keydown', handleGlobalShortcut, true);

  // Some Electron/Chromium focus paths can miss the first document listener after
  // launch. Re-asserting focus and exposing an imperative hook gives both the
  // sidebar search box and tests a reliable command-palette entry point.
  window.addEventListener('focus', () => {
    document.body?.setAttribute('data-shortcuts-ready', 'true');
  });
  setRuntime('openCommandPalette', openSearchOverlay);
}


// --- Global Search / Command Palette ---

type PaletteResult = {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  icon: string;
  iconHtml?: string;
  keywords?: string[];
  hotkey?: string;
  action: () => void | Promise<void>;
};

let paletteResults: PaletteResult[] = [];
let paletteSelectedIndex = 0;
let paletteSearchTimer: ReturnType<typeof setTimeout> | null = null;
let paletteLastQuery = '';
const RECENT_COMMANDS_KEY = 'nova-recent-command-ids';

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

  container.innerHTML = '<div class="search-empty">正在搜索文件、文档、待办和知识库...</div>';
  const lower = q.toLowerCase();
  const actions = getCommandActions().filter((item) => paletteMatches(item, lower));
  const todos = await searchTodoResults(lower);
  const files = await searchWorkspaceResults(q).catch((error) => {
    console.warn('[Palette] workspace search failed:', error);
    return [] as PaletteResult[];
  });
  const knowledge = await searchKnowledgeResults(lower).catch((error) => {
    console.warn('[Palette] knowledge search failed:', error);
    return [] as PaletteResult[];
  });

  if (paletteLastQuery !== q) return;
  paletteResults = [...actions, ...files, ...knowledge, ...todos].slice(0, 80);
  renderPaletteSections(container, paletteResults);
}

function getDefaultPaletteActions(): PaletteResult[] {
  return [
    ...getRecentCommandActions(),
    ...getCommandActions().slice(0, 22),
    { id: 'page-home', group: '页面', title: '首页', subtitle: '回到今日工作台', icon: '首页', iconHtml: commandIcon('home'), hotkey: 'Alt+1', action: () => { void switchPage('home'); } },
    { id: 'page-project', group: '页面', title: '项目概览', subtitle: '查看当前工作区状态、统计和项目 AI', icon: '项目', iconHtml: commandIcon('project'), hotkey: 'Alt+2', action: () => { void switchPage('project'); } },
    { id: 'page-files', group: '页面', title: '文件管理', subtitle: '浏览和编辑工作区文件', icon: '文件', iconHtml: commandIcon('folder'), hotkey: 'Alt+3', action: () => { void switchPage('files'); } },
    { id: 'page-ai', group: '页面', title: 'AI 助手', subtitle: '打开 AI 对话与配置侧栏', icon: 'AI', iconHtml: commandIcon('ai'), hotkey: 'Alt+4', action: () => { void switchPage('ai'); } },
    { id: 'page-todo', group: '页面', title: '待办中心', subtitle: '查看和管理任务', icon: '待办', iconHtml: commandIcon('task'), hotkey: 'Alt+5', action: () => { void switchPage('todo'); } },
    { id: 'page-knowledge', group: '页面', title: '知识库', subtitle: '导入和管理项目知识资料', icon: '知识', iconHtml: commandIcon('knowledge'), action: () => { void switchPage('knowledge'); } },
    { id: 'page-settings', group: '页面', title: '设置', subtitle: '模型、主题和快捷键', icon: '设置', iconHtml: commandIcon('settings'), action: () => { void switchPage('settings'); } },
  ];
}

// 命令列表缓存：模板/命令结构在会话内基本稳定，避免每次打开命令面板都重建两次
let cachedCommandActions: PaletteResult[] | null = null;

export function invalidateCommandCache(): void {
  cachedCommandActions = null;
}

function getCommandActions(): PaletteResult[] {
  if (cachedCommandActions) return cachedCommandActions;
  cachedCommandActions = buildCommandActions();
  return cachedCommandActions;
}

function buildCommandActions(): PaletteResult[] {
  const templateActions = buildTemplateCommandResults((template) => {
    void (async () => {
      await switchPage('files');
      bus.emit(BusEvents.FileNewFromTemplate, template.id);
    })();
  });

  return [
    { id: 'cmd-open-folder', group: '常用命令', title: '打开工作区', subtitle: '选择一个本地文件夹作为项目', icon: '打开', iconHtml: commandIcon('folder'), hotkey: 'Ctrl+O', keywords: ['workspace', 'folder', '项目'], action: async () => { await switchPage('files'); bus.emit(BusEvents.FileOpenFolder); } },
    { id: 'cmd-project-overview', group: '常用命令', title: '打开项目概览', subtitle: '查看当前工作区统计和动态', icon: '项目', iconHtml: commandIcon('project'), hotkey: 'Alt+2', keywords: ['dashboard', 'overview'], action: () => { void switchPage('project'); } },
    { id: 'cmd-new-file', group: '常用命令', title: '新建文档', subtitle: '选择模板并创建 Markdown 文档', icon: '文档', iconHtml: commandIcon('new-doc'), hotkey: 'Ctrl+N', keywords: ['markdown', 'template', 'md'], action: async () => { await switchPage('files'); bus.emit(BusEvents.FileNew); } },
    { id: 'cmd-new-todo', group: '常用命令', title: '新建待办', subtitle: '快速创建一条任务', icon: '待办', iconHtml: commandIcon('new-todo'), keywords: ['task', 'todo'], action: createQuickTodo },
    { id: 'cmd-ai', group: '常用命令', title: '打开 AI 助手', subtitle: '进入 AI 对话页', icon: 'AI', iconHtml: commandIcon('ai'), hotkey: 'Alt+4', keywords: ['chat', 'model'], action: () => { void switchPage('ai'); } },
    { id: 'cmd-settings', group: '常用命令', title: '打开设置', subtitle: '配置 AI Provider、主题和快捷键', icon: '设置', iconHtml: commandIcon('settings'), keywords: ['config', 'theme'], action: () => { void switchPage('settings'); } },
    { id: 'cmd-theme-cycle', group: '常用命令', title: '切换深浅色主题', subtitle: '在浅色、深色和跟随系统之间切换', icon: '主题', iconHtml: commandIcon('sparkles'), keywords: ['theme', 'dark', 'light'], action: cycleTheme },
    { id: 'cmd-onboarding', group: '常用命令', title: '重新查看首次使用引导', subtitle: '重新打开 Nova 工作台的五步引导', icon: '引导', iconHtml: commandIcon('learning'), keywords: ['guide', 'help', 'onboarding'], action: () => getRuntime('startOnboarding')?.() },
    { id: 'cmd-edit-mode', group: '文档命令', title: '切换到编辑模式', subtitle: '仅显示 Markdown 编辑器', icon: '编辑', iconHtml: commandIcon('new-doc'), action: () => runActiveMarkdownModeCommand('edit') },
    { id: 'cmd-preview-mode', group: '文档命令', title: '切换到预览模式', subtitle: '仅显示 Markdown 渲染预览', icon: '预览', iconHtml: commandIcon('file'), action: () => runActiveMarkdownModeCommand('preview') },
    { id: 'cmd-split-mode', group: '文档命令', title: '切换到分屏模式', subtitle: '左侧编辑右侧预览', icon: '分屏', iconHtml: commandIcon('files'), action: () => runActiveMarkdownModeCommand('split') },
    ...templateActions,
    { id: 'cmd-ai-summary', group: 'AI 工作流', title: 'AI 总结当前文档', subtitle: '基于当前 Markdown 生成总结', icon: '总结', iconHtml: commandIcon('summary'), action: () => runActiveMarkdownCommand('summary') },
    { id: 'cmd-ai-outline', group: 'AI 工作流', title: 'AI 生成文档大纲', subtitle: '基于当前 Markdown 生成大纲', icon: '大纲', iconHtml: commandIcon('report'), action: () => runActiveMarkdownCommand('outline') },
    { id: 'cmd-ai-rewrite', group: 'AI 工作流', title: 'AI 改写选中文本', subtitle: '对当前选中的内容进行改写', icon: '改写', iconHtml: commandIcon('sparkles'), action: () => runActiveMarkdownCommand('rewrite') },
    { id: 'cmd-ai-todo', group: 'AI 工作流', title: 'AI 根据当前文档生成待办', subtitle: '从当前 Markdown 提取任务', icon: '待办', iconHtml: commandIcon('task'), action: () => runActiveMarkdownCommand('todo') },
    { id: 'cmd-ask-doc', group: 'AI 工作流', title: '问当前文档', subtitle: '基于当前 Markdown 向 AI 提问', icon: '问答', iconHtml: commandIcon('ai'), action: () => runActiveMarkdownCommand('askdoc') },
    { id: 'cmd-ai-format-current', group: 'AI 工作流', title: 'AI 格式化当前文件', subtitle: '复用文件管理器的 AI 格式化能力', icon: '格式化', iconHtml: commandIcon('sparkles'), action: () => runFileWorkflowCommand('format') },
    { id: 'cmd-export-current-html', group: '导出', title: '导出当前文档为 HTML', subtitle: '把当前 Markdown 导出为网页文件', icon: 'HTML', iconHtml: commandIcon('report'), action: () => runActiveMarkdownCommand('exporthtml') },
    { id: 'cmd-export-current-pdf', group: '导出', title: '导出当前文档为 PDF', subtitle: '把当前 Markdown 导出为 PDF', icon: 'PDF', iconHtml: commandIcon('pdf'), action: () => runActiveMarkdownCommand('exportpdf') },
    { id: 'cmd-export-project-md', group: '导出', title: '导出项目报告 Markdown', subtitle: '基于当前项目概览生成报告', icon: '报告', iconHtml: commandIcon('report'), action: () => runProjectExportCommand('markdown') },
    { id: 'cmd-export-project-pdf', group: '导出', title: '导出项目报告 PDF', subtitle: '基于当前项目概览生成 PDF 报告', icon: 'PDF', iconHtml: commandIcon('pdf'), action: () => runProjectExportCommand('pdf') },
    { id: 'cmd-save-version', group: '文档命令', title: '保存当前版本', subtitle: '为当前文档创建历史版本', icon: '历史', iconHtml: commandIcon('history'), action: () => runActiveMarkdownCommand('saveversion') },
    { id: 'cmd-history', group: '文档命令', title: '查看版本历史', subtitle: '预览、恢复或删除历史版本', icon: '历史', iconHtml: commandIcon('history'), action: () => runActiveMarkdownCommand('history') },
  ];
}


function commandIcon(name: NovaIconName | string): string {
  return novaIcon(name, 'command-svg-icon');
}

function paletteMatches(item: PaletteResult, lowerQuery: string): boolean {
  return [item.title, item.subtitle || '', item.group, ...(item.keywords || [])]
    .join(' ')
    .toLowerCase()
    .includes(lowerQuery);
}

function getRecentCommandActions(): PaletteResult[] {
  const all = getCommandActions();
  const recentIds = getRecentCommandIds();
  return recentIds
    .map((id) => all.find((item) => item.id === id))
    .filter((item): item is PaletteResult => Boolean(item))
    .slice(0, 6)
    .map((item) => ({ ...item, group: '最近使用' }));
}

function getRecentCommandIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_COMMANDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function rememberRecentCommand(item: PaletteResult): void {
  if (!item.id.startsWith('cmd-') && !item.id.startsWith('template-')) return;
  try {
    const next = [item.id, ...getRecentCommandIds().filter((id) => id !== item.id)].slice(0, 10);
    localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
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
        await switchPage('todo');
        void getRuntime('openTodoTask')?.(task.id);
      },
    }));
  } catch {
    return [];
  }
}

async function searchKnowledgeResults(lowerQuery: string): Promise<PaletteResult[]> {
  const root = getCurrentWorkspaceRoot();
  if (!root) return [];
  try {
    const index = await ipcClient.knowledge.list(root);
    const items = index.items || [];

    // Phase 1: Match title, summary, tags (fast)
    const titleMatched: typeof items = [];
    const unmatched: typeof items = [];
    for (const item of items) {
      const haystack = (item.title + ' ' + (item.summary || '') + ' ' + (item.tags || []).join(' ')).toLowerCase();
      if (haystack.includes(lowerQuery)) {
        titleMatched.push(item);
      } else {
        unmatched.push(item);
      }
    }

    // Phase 2: Full-text search on unmatched items (limited to first 20 for performance)
    const contentMatched: { item: typeof items[0]; snippet: string }[] = [];
    const toSearch = unmatched.slice(0, 20);
    await Promise.all(toSearch.map(async (item) => {
      try {
        const text = await ipcClient.knowledge.getText(item.id, root);
        const lowerText = text.toLowerCase();
        const idx = lowerText.indexOf(lowerQuery);
        if (idx >= 0) {
          const start = Math.max(0, idx - 40);
          const end = Math.min(text.length, idx + lowerQuery.length + 40);
          const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
          contentMatched.push({ item, snippet });
        }
      } catch {
        // skip
      }
    }));

    const sourceIcons: Record<string, string> = { pdf: '📄', md: '📋', txt: '📝', clipboard: '📋', url: '🌐' };
    const results: PaletteResult[] = [];

    // Title matches first (higher priority)
    for (const item of titleMatched.slice(0, 10)) {
      results.push({
        id: 'kb-' + item.id,
        group: '知识库',
        title: item.title,
        subtitle: (item.summary ? item.summary.slice(0, 60) + (item.summary.length > 60 ? '…' : '') : '无摘要') + ' · ' + (sourceIcons[item.sourceType] || '📚') + ' ' + item.sourceType,
        icon: sourceIcons[item.sourceType] || '📚',
        action: async () => {
          await switchPage('knowledge');
          void getRuntime('openKnowledgeItem')?.(item.id);
        },
      });
    }

    // Content matches
    for (const { item, snippet } of contentMatched.slice(0, 5)) {
      results.push({
        id: 'kb-content-' + item.id,
        group: '知识库内容',
        title: item.title,
        subtitle: '🔎 ' + snippet.slice(0, 80) + (snippet.length > 80 ? '…' : ''),
        icon: '🔎',
        action: async () => {
          await switchPage('knowledge');
          void getRuntime('openKnowledgeItem')?.(item.id);
        },
      });
    }

    return results;
  } catch {
    return [];
  }
}

async function searchWorkspaceResults(query: string): Promise<PaletteResult[]> {
  const root = getCurrentWorkspaceRoot();
  if (!root) return [];
  const results = await ipcClient.fs.searchWorkspace({ rootPath: root, query, limit: 50 });
  const paletteResults: PaletteResult[] = [];

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    const relPath = item.relativePath || relativePath(root, item.path);
    const matchCount = item.matchCount || 0;
    const extBadge = item.ext ? item.ext.slice(1).toUpperCase() : '';

    // Add the main result
    paletteResults.push({
      id: item.type + '-' + i + '-' + item.path,
      group: item.type === 'content' ? '文档内容' : '文件',
      title: item.name,
      subtitle: item.type === 'content'
        ? (matchCount > 1 ? `${matchCount} 处匹配 · ` : '') + `第 ${item.line || item.matches?.[0]?.line || 1} 行 · ${item.snippet || item.matches?.[0]?.snippet || relPath}`
        : (extBadge ? `[${extBadge}] ` : '') + relPath,
      icon: item.type === 'content' ? '🔎' : fileIcon(item.name),
      action: () => openFileFromPalette(item.path),
    });

    // Add extra matches for content results (up to 2 additional matches)
    if (item.type === 'content' && item.matches && item.matches.length > 1) {
      const extraMatches = item.matches.slice(1, 3);
      for (let j = 0; j < extraMatches.length; j++) {
        const match = extraMatches[j];
        paletteResults.push({
          id: item.type + '-' + i + '-m' + j + '-' + item.path,
          group: '文档内容',
          title: '  ↳ ' + item.name,
          subtitle: `第 ${match.line} 行 · ${match.snippet}`,
          icon: '🔎',
          action: () => openFileFromPalette(item.path),
        });
      }
    }
  }

  return paletteResults;
}

function getCurrentWorkspaceRoot(): string {
  const store = getRuntime('filesStore');
  const root = store?.getWorkspaceRoot?.() || store?.getState?.()?.workspaceRoot || '';
  return typeof root === 'string' ? root : '';
}

function openFileFromPalette(filePath: string): void {
  void (async () => {
    await switchPage('files');
    const openFilePath = getRuntime('openFilePath');
    if (typeof openFilePath === 'function') void openFilePath(filePath);
  })();
}

function runActiveMarkdownCommand(action: string): void {
  void (async () => {
    await switchPage('files');
    bus.emit(BusEvents.EditorRunCommand, action);
  })();
}

function runActiveMarkdownModeCommand(mode: 'edit' | 'preview' | 'split'): void {
  void (async () => {
    await switchPage('files');
    bus.emit(BusEvents.EditorSetMode, mode);
  })();
}

function runFileWorkflowCommand(workflowId: string): void {
  void (async () => {
    await switchPage('files');
    bus.emit(BusEvents.FileRunAIWorkflow, workflowId);
  })();
}

function runProjectExportCommand(format: 'markdown' | 'pdf' | 'html'): void {
  void (async () => {
    await switchPage('project');
    void getRuntime('exportProjectReport')?.(format);
  })();
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
  await switchPage('todo');
  getRuntime('focusTodoQuickInput')?.();
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
        '<span class="search-item-icon">' + (item.iconHtml || escHtml(item.icon)) + '</span>' +
        '<span class="search-item-main"><span class="search-item-name">' + escHtml(item.title) + '</span>' +
        (item.subtitle ? '<span class="search-item-subtitle">' + escHtml(item.subtitle) + '</span>' : '') + '</span>' +
        (item.hotkey ? '<kbd class="search-item-hotkey">' + escHtml(item.hotkey) + '</kbd>' : '') +
      '</div>';
    }).join('');
    return '<div class="search-section"><div class="search-section-title">' + escHtml(group) + '</div>' + rows + '</div>';
  }).join('') + '<div class="search-footer"><span>↑↓ 选择 · Enter 执行 · Esc 关闭</span><span>输入关键词可搜索文件、知识库和命令</span></div>';

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
  rememberRecentCommand(item);
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


// --- Local user login (localStorage only) ---
type LocalUser = {
  name: string;
  role: string;
  loggedIn: boolean;
  updatedAt: number;
};

const LOCAL_USER_KEY = 'nova-local-user';

function initLocalLogin(): void {
  renderLocalUser();
  document.getElementById('local-user-card')?.addEventListener('click', showLocalLoginModal);
}

function getLocalUser(): LocalUser {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    if (raw) return JSON.parse(raw) as LocalUser;
  } catch { /* ignore */ }
  return { name: '', role: '', loggedIn: false, updatedAt: Date.now() };
}

function saveLocalUser(user: LocalUser): void {
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
  renderLocalUser();
}

function clearLocalUser(): void {
  localStorage.removeItem(LOCAL_USER_KEY);
  renderLocalUser();
}

function renderLocalUser(): void {
  const user = getLocalUser();
  const nameEl = document.getElementById('local-user-name');
  const roleEl = document.getElementById('local-user-role');
  const avatarEl = document.getElementById('local-user-avatar');
  const card = document.getElementById('local-user-card');

  const name = user.loggedIn && user.name ? user.name : '未登录';
  const role = user.loggedIn ? (user.role || '本地用户') : '点击本地登录';
  if (nameEl) nameEl.textContent = name;
  if (roleEl) roleEl.textContent = role;
  if (avatarEl) avatarEl.textContent = user.loggedIn ? getInitial(name) : '?';
  card?.classList.toggle('logged-in', user.loggedIn);
}

function showLocalLoginModal(): void {
  const current = getLocalUser();
  const modal = document.createElement('div');
  modal.className = 'local-login-modal';
  modal.innerHTML =
    '<div class="local-login-card">' +
      '<div class="local-login-header">' +
        '<div><h3>本地登录</h3><p>仅保存在当前电脑，不连接服务器。</p></div>' +
        '<button class="local-login-close" data-action="close" title="关闭">×</button>' +
      '</div>' +
      '<label>用户名</label>' +
      '<input class="local-login-input" id="local-login-name" value="' + escAttr(current.name || '') + '" placeholder="例如：GJC" maxlength="24">' +
      '<label>身份 / 备注</label>' +
      '<input class="local-login-input" id="local-login-role" value="' + escAttr(current.role || '') + '" placeholder="例如：开发者" maxlength="30">' +
      '<div class="local-login-actions">' +
        (current.loggedIn ? '<button class="local-login-secondary" data-action="logout">退出登录</button>' : '') +
        '<button class="local-login-secondary" data-action="close">取消</button>' +
        '<button class="local-login-primary" data-action="save">保存登录</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target === modal || target.dataset.action === 'close') close();
    if (target.dataset.action === 'logout') {
      clearLocalUser();
      close();
    }
    if (target.dataset.action === 'save') {
      const name = (document.getElementById('local-login-name') as HTMLInputElement | null)?.value.trim() || '本地用户';
      const role = (document.getElementById('local-login-role') as HTMLInputElement | null)?.value.trim() || '本地用户';
      saveLocalUser({ name, role, loggedIn: true, updatedAt: Date.now() });
      close();
    }
  });
  window.setTimeout(() => (document.getElementById('local-login-name') as HTMLInputElement | null)?.focus(), 0);
}

function getInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const first = trimmed[0];
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
}

function initAutoUpdateStatus(): void {
  const updateApi = ipcClient.update;
  if (!updateApi?.onStatus) return;
  updateApi.onStatus((state) => {
    if (state.status === 'error') console.warn('[Updater]', state.message);
    if (state.status === 'downloaded') showMiniToast(state.message + '，可在重启后安装。');
  });
}

function showMiniToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'mini-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  window.setTimeout(() => {
    toast.classList.remove('show');
    window.setTimeout(() => toast.remove(), 220);
  }, 4200);
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);