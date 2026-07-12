/**
 * Files Page - orchestrates file tree, editor tabs, and file operations.
 * Features: drag-and-drop, state persistence restore.
 */
import { FileTree } from './file-tree';
import { EditorManager } from './editor-manager';
import { FilesStore } from './files-store';
import { ipcClient } from '../../services/ipc-client';
import { registerPageInit, PageId } from '../../app/router';
import { showInputPrompt, showAlert } from '../../components/modal';
import { aiService } from '../ai/ai-service';
import { createDocumentFromTemplate } from '../../services/template-service';
import { escHtml, escAttr } from '../../utils/escape';
import { refreshCurrentName as refreshWorkspaceSwitcherName } from '../../app/workspace-switcher';
import { installFileCopilot } from './ai-copilot';
import { stripReasoningBlocks } from '@shared/utils/ai-capabilities';
import { bus, BusEvents } from '../../services/bus';
import { toast } from '../../utils/toast';
import { getRuntime, setRuntime } from '../../services/runtime';

const store = new FilesStore();
let fileTree: FileTree | null = null;
let editorManager: EditorManager | null = null;
let isRestoringWorkspace = false;
let workspaceSaveTimer: ReturnType<typeof setTimeout> | null = null;
let isAiFormatRunning = false;
let filesToolbarBound = false;
let quickOpenFiles: string[] = [];
let quickOpenSelectedIndex = 0;
let newDocumentDialogOpen = false;
let fileAIWorkflowBound = false;

function scheduleWorkspaceSessionSave(): void {
  if (isRestoringWorkspace) return;
  const input = store.toWorkspaceSessionInput();
  if (!input) return;
  if (workspaceSaveTimer) clearTimeout(workspaceSaveTimer);
  workspaceSaveTimer = setTimeout(() => {
    const snapshot = store.toWorkspaceSessionInput();
    if (!snapshot) return;
    ipcClient.workspace.saveSession(snapshot).catch((err) => {
      console.warn('[Files] Failed to save workspace session:', err);
    });
  }, 500);
}

async function flushWorkspaceSession(): Promise<void> {
  if (workspaceSaveTimer) {
    clearTimeout(workspaceSaveTimer);
    workspaceSaveTimer = null;
  }
  const input = store.toWorkspaceSessionInput();
  if (!input) return;
  try {
    await ipcClient.workspace.saveSession(input);
  } catch (err) {
    console.warn('[Files] Failed to flush workspace session:', err);
  }
}

async function openWorkspaceRoot(rootPath: string, options: { restoreSession?: boolean } = {}): Promise<void> {
  if (!fileTree || !editorManager) return;
  const restoreSession = options.restoreSession !== false;

  if (!isRestoringWorkspace) {
    await flushWorkspaceSession();
  }

  isRestoringWorkspace = true;
  try {
    const name = rootPath.split(/[/\\]/).pop() || rootPath;
    await ipcClient.workspace.open({ rootPath, name });
    await ipcClient.recent.add({ name, path: rootPath, lastOpened: new Date().toISOString() }).catch(() => []);

    store.resetForWorkspace(rootPath, { emit: false });
    editorManager.resetForWorkspace();
    await fileTree.openProjectPath(rootPath, { recordWorkspace: false });

    const session = restoreSession ? await ipcClient.workspace.getSession(rootPath) : null;
    if (session) {
      store.setFavorites(session.favorites || []);
      store.setSelectedFolder(session.selectedFolderPath || rootPath);
      updateBreadcrumb(session.selectedFolderPath || rootPath);

      for (const tabPath of session.openTabs || []) {
        const fileName = tabPath.split(/[/\\]/).pop() || tabPath;
        await editorManager.openFile(tabPath, fileName);
        editorManager.pinTab(tabPath);
      }

      if (session.activeFilePath) {
        editorManager.switchToTab(session.activeFilePath);
      }
    } else {
      store.setSelectedFolder(rootPath);
      updateBreadcrumb(rootPath);
    }
  } catch (err) {
    console.warn('[Files] Failed to open workspace:', err);
    throw err;
  } finally {
    isRestoringWorkspace = false;
    scheduleWorkspaceSessionSave();
    void refreshWorkspaceSwitcherName();
  }
}

async function chooseAndOpenWorkspace(): Promise<void> {
  const result = await ipcClient.fs.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths.length) return;
  await openWorkspaceRoot(result.filePaths[0], { restoreSession: true });
}

function getTargetDir(): string | null {
  return fileTree?.getCreateTargetDir() ?? store.getCreateTargetDir();
}

async function handleNewFile(): Promise<void> {
  console.debug('[Files] new-file click');
  if (newDocumentDialogOpen) return;
  const dir = getTargetDir();
  if (!dir) {
    showAlert('请先打开一个文件夹');
    return;
  }

  newDocumentDialogOpen = true;
  try {
    await createDocumentFromTemplate(undefined, {
      targetDir: dir,
      afterCreate: async () => { await fileTree?.render(); },
      openFile: async (filePath, fileName) => {
        if (editorManager && filePath) await editorManager.openFile(filePath, fileName);
      },
    });
  } finally {
    newDocumentDialogOpen = false;
  }
}

async function handleNewFileFromTemplate(templateId: string): Promise<void> {
  if (newDocumentDialogOpen) return;
  const dir = getTargetDir();
  if (!dir) {
    showAlert('请先打开一个文件夹');
    return;
  }
  newDocumentDialogOpen = true;
  try {
    await createDocumentFromTemplate(templateId, {
      targetDir: dir,
      afterCreate: async () => { await fileTree?.render(); },
      openFile: async (filePath, fileName) => {
        if (editorManager && filePath) await editorManager.openFile(filePath, fileName);
      },
    });
  } finally {
    newDocumentDialogOpen = false;
  }
}

async function handleNewFolder(): Promise<void> {
  console.debug('[Files] new-folder click');
  const dir = getTargetDir();
  if (!dir) {
    showAlert('\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u6587\u4EF6\u5939');
    return;
  }

  const name = await showInputPrompt('New Folder', '\u8F93\u5165\u6587\u4EF6\u5939\u540D');
  if (!name?.trim()) return;

  try {
    await ipcClient.fs.createDirectory(dir, name.trim());
    console.log('[Files] Created directory in:', dir);
    await fileTree?.render();
  } catch (err) {
    console.error('[Files] Create directory failed:', err);
    showAlert('\u521B\u5EFA\u6587\u4EF6\u5939\u5931\u8D25: ' + (err instanceof Error ? err.message : String(err)));
  }
}


function showToast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info'): void {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}


function updateBreadcrumb(folderPath: string | null): void {
  const breadcrumb = document.getElementById('files-breadcrumb');
  if (!breadcrumb) return;
  const root = store.getWorkspaceRoot();
  if (!root || !folderPath) {
    breadcrumb.innerHTML = '<span class="breadcrumb-item active">工作区</span>';
    return;
  }
  const parts = folderPath.replace(root, '').split('/').filter(Boolean);
  let html = '<span class="breadcrumb-item" data-path="' + root + '">工作区</span>';
  let accum = root;
  for (const part of parts) {
    accum = accum + (accum.endsWith('/') || accum.endsWith('\\') ? '' : '/') + part;
    html += '<span class="breadcrumb-separator">/</span>';
    html += '<span class="breadcrumb-item" data-path="' + accum + '">' + escHtml(part) + '</span>';
  }
  breadcrumb.innerHTML = html;
  // Click to navigate
  breadcrumb.querySelectorAll('.breadcrumb-item').forEach(item => {
    item.addEventListener('click', () => {
      const path = (item as HTMLElement).dataset.path || '';
      fileTree?.navigateToFolder(path);
    });
  });
}



function ensureFileEditorActions(): void {
  const actions = document.querySelector('.file-sidebar-actions');
  if (!actions || document.getElementById('btn-refresh-tree')) return;

  actions.insertAdjacentHTML('beforeend',
    '<button class="icon-btn" id="btn-refresh-tree" title="刷新文件树">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M16 8h5V3"/></svg>' +
    '</button>' +
    '<button class="icon-btn" id="btn-reveal-active-file" title="定位当前文件">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>' +
    '</button>' +
    '<button class="icon-btn" id="btn-quick-open-file" title="快速打开文件 Ctrl+P">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>' +
    '</button>'
  );
}

function ensureQuickOpenOverlay(): HTMLElement {
  let overlay = document.getElementById('quick-open-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'quick-open-overlay';
  overlay.className = 'quick-open-overlay';
  overlay.innerHTML =
    '<div class="quick-open-backdrop"></div>' +
    '<div class="quick-open-panel" role="dialog" aria-label="快速打开文件">' +
      '<div class="quick-open-input-row">' +
        '<span class="quick-open-icon">⌘P</span>' +
        '<input id="quick-open-input" class="quick-open-input" placeholder="输入文件名或路径快速打开..." autocomplete="off" />' +
      '</div>' +
      '<div id="quick-open-results" class="quick-open-results"></div>' +
      '<div class="quick-open-footer">↑↓ 选择 · Enter 打开 · Esc 关闭</div>' +
    '</div>';
  document.body.appendChild(overlay);

  overlay.querySelector('.quick-open-backdrop')?.addEventListener('click', closeQuickOpen);
  const input = overlay.querySelector('#quick-open-input') as HTMLInputElement | null;
  input?.addEventListener('input', () => {
    quickOpenSelectedIndex = 0;
    renderQuickOpenResults(input.value);
  });
  input?.addEventListener('keydown', (event) => {
    const visible = overlay?.classList.contains('active');
    if (!visible) return;
    const results = Array.from(document.querySelectorAll('.quick-open-item')) as HTMLElement[];

    if (event.key === 'Escape') {
      event.preventDefault();
      closeQuickOpen();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      quickOpenSelectedIndex = results.length ? (quickOpenSelectedIndex + 1) % results.length : 0;
      updateQuickOpenSelection();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      quickOpenSelectedIndex = results.length ? (quickOpenSelectedIndex - 1 + results.length) % results.length : 0;
      updateQuickOpenSelection();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const target = results[quickOpenSelectedIndex] || results[0];
      const path = target?.dataset.path;
      if (path) openQuickOpenFile(path);
    }
  });

  return overlay;
}

async function openQuickOpen(): Promise<void> {
  if (!fileTree) {
    showToast('请先打开一个工作区', 'info');
    return;
  }

  const overlay = ensureQuickOpenOverlay();
  overlay.classList.add('active');
  const input = overlay.querySelector('#quick-open-input') as HTMLInputElement | null;
  const results = overlay.querySelector('#quick-open-results');
  if (results) results.innerHTML = '<div class="quick-open-empty">正在扫描文件...</div>';
  input!.value = '';
  input?.focus();

  try {
    quickOpenFiles = await fileTree.listFiles(1500);
    quickOpenSelectedIndex = 0;
    renderQuickOpenResults('');
  } catch (error) {
    console.warn('[Files] quick open scan failed:', error);
    if (results) results.innerHTML = '<div class="quick-open-empty">扫描文件失败</div>';
  }
}

function closeQuickOpen(): void {
  document.getElementById('quick-open-overlay')?.classList.remove('active');
}

function renderQuickOpenResults(query: string): void {
  const results = document.getElementById('quick-open-results');
  if (!results) return;

  const q = query.trim().toLowerCase();

  let matches: Array<{ path: string; score: number; highlightName: string; highlightPath: string }>;

  if (!q) {
    // No query: show recent files (first 40)
    matches = quickOpenFiles.slice(0, 40).map(p => {
      const name = p.split(/[/\\]/).pop() || p;
      const root = store.getWorkspaceRoot();
      const relative = root ? p.replace(root, '').replace(/^[/\\]/, '') : p;
      return { path: p, score: 0, highlightName: escHtml(name), highlightPath: escHtml(relative) };
    });
  } else {
    // Fuzzy match with scoring
    matches = quickOpenFiles
      .map(p => {
        const name = (p.split(/[/\\]/).pop() || p).toLowerCase();
        const score = fuzzyScorePath(q, name, p.toLowerCase());
        return { path: p, score, name };
      })
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 80)
      .map(m => {
        const name = m.path.split(/[/\\]/).pop() || m.path;
        const root = store.getWorkspaceRoot();
        const relative = root ? m.path.replace(root, '').replace(/^[/\\]/, '') : m.path;
        return {
          path: m.path,
          score: m.score,
          highlightName: highlightMatch(name, q),
          highlightPath: escHtml(relative),
        };
      });
  }

  if (matches.length === 0) {
    results.innerHTML = '<div class="quick-open-empty">没有匹配的文件</div>';
    return;
  }

  results.innerHTML = matches.map((m, index) =>
    '<div class="quick-open-item' + (index === quickOpenSelectedIndex ? ' selected' : '') + '" data-path="' + escAttr(m.path) + '">' +
      '<span class="quick-open-file-name">' + m.highlightName + '</span>' +
      '<span class="quick-open-file-path">' + m.highlightPath + '</span>' +
    '</div>'
  ).join('');

  results.querySelectorAll('.quick-open-item').forEach((item, index) => {
    item.addEventListener('mouseenter', () => {
      quickOpenSelectedIndex = index;
      updateQuickOpenSelection();
    });
    item.addEventListener('click', () => {
      const path = (item as HTMLElement).dataset.path;
      if (path) openQuickOpenFile(path);
    });
  });
}

/** Fuzzy score: all query chars must appear in order. Rewards consecutive matches and start-of-word. */
function fuzzyScorePath(query: string, nameLower: string, pathLower: string): number {
  // Exact substring match gets highest score
  if (nameLower.includes(query)) return 100 + query.length;
  if (pathLower.includes(query)) return 50 + query.length;

  // Fuzzy character-by-character match
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  for (let ti = 0; ti < nameLower.length && qi < query.length; ti++) {
    if (nameLower[ti] === query[qi]) {
      qi++;
      consecutive++;
      score += consecutive * 3;
      // Bonus for matching after separator (start of word)
      if (ti === 0 || nameLower[ti - 1] === '/' || nameLower[ti - 1] === '\\' || nameLower[ti - 1] === '-' || nameLower[ti - 1] === '_' || nameLower[ti - 1] === '.') {
        score += 10;
      }
    } else {
      consecutive = 0;
    }
  }
  if (qi < query.length) {
    // Try matching against the full path
    qi = 0;
    score = 0;
    consecutive = 0;
    for (let ti = 0; ti < pathLower.length && qi < query.length; ti++) {
      if (pathLower[ti] === query[qi]) {
        qi++;
        consecutive++;
        score += consecutive * 2;
        if (ti === 0 || pathLower[ti - 1] === '/' || pathLower[ti - 1] === '\\' || pathLower[ti - 1] === '-' || pathLower[ti - 1] === '_' || pathLower[ti - 1] === '.') {
          score += 8;
        }
      } else {
        consecutive = 0;
      }
    }
    if (qi < query.length) return 0;
  }
  return Math.max(1, score);
}

/** Highlight matched characters in a string with <mark> tags. */
function highlightMatch(text: string, query: string): string {
  if (!query) return escHtml(text);
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const result: string[] = [];
  let qi = 0;

  for (let i = 0; i < text.length; i++) {
    if (qi < q.length && t[i] === q[qi]) {
      result.push('<mark>' + escHtml(text[i]) + '</mark>');
      qi++;
    } else {
      result.push(escHtml(text[i]));
    }
  }
  return result.join('');
}

function updateQuickOpenSelection(): void {
  const items = Array.from(document.querySelectorAll('.quick-open-item')) as HTMLElement[];
  items.forEach((item, index) => item.classList.toggle('selected', index === quickOpenSelectedIndex));
  items[quickOpenSelectedIndex]?.scrollIntoView({ block: 'nearest' });
}

function openQuickOpenFile(filePath: string): void {
  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  closeQuickOpen();
  editorManager?.openFile(filePath, fileName);
  window.dispatchEvent(new CustomEvent('nova:active-file-changed'));
  void fileTree?.revealPath(filePath);
}


function bindFileAIWorkflowBar(): void {
  const bar = document.getElementById('file-ai-workflow-bar');
  if (!bar || fileAIWorkflowBound) return;
  fileAIWorkflowBound = true;

  bar.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest('[data-file-ai-workflow]') as HTMLElement | null;
    const workflowId = button?.dataset.fileAiWorkflow || '';
    if (!workflowId) return;
    void runFileAIWorkflow(workflowId);
  });
}

async function runFileAIWorkflow(workflowId: string): Promise<void> {
  if (!editorManager?.activeEditor) {
    showToast('请先打开一个文件，再运行 AI 工作流', 'info');
    return;
  }

  const snapshot = getRuntime('getActiveFileSnapshot')?.();
  const isMarkdown = Boolean(snapshot?.fileName && /\.(md|markdown|mdown|mkdn)$/i.test(snapshot.fileName));

  if (workflowId === 'format') {
    await runAiFormatCurrentFile();
    return;
  }

  if (!isMarkdown) {
    showToast('当前工作流主要面向 Markdown 文档。普通代码/文本文件可先使用“格式化”。', 'info');
    return;
  }

  const commandMap: Record<string, string> = {
    summary: 'summary',
    outline: 'outline',
    askdoc: 'askdoc',
    rewrite: 'rewrite',
    todo: 'todo',
  };

  const command = commandMap[workflowId];
  if (!command) {
    showToast('未知 AI 工作流：' + workflowId, 'error');
    return;
  }

  await editorManager.runMarkdownCommand(command);
}

async function runAiFormatCurrentFile(btn?: HTMLButtonElement | null): Promise<void> {
  console.debug('[Files] AI format current file');
  if (isAiFormatRunning) return;

  await aiService.reloadConfig().catch(() => undefined);
  if (!aiService.isConfigured()) {
    showToast('请先在设置页配置 AI 模型', 'warning');
    return;
  }

  const activePath = store.getActiveFilePath();
  if (!activePath || !editorManager) {
    showToast('请先打开一个文件', 'info');
    return;
  }

  const editorData = editorManager.getEditorByPath(activePath);
  if (!editorData) return;

  const content = editorData.model.getValue();
  if (!content.trim()) {
    showToast('文件内容为空', 'info');
    return;
  }

  const originalHTML = btn?.innerHTML || '';
  isAiFormatRunning = true;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '格式化中...';
    btn.classList.add('loading');
    btn.classList.remove('success');
  }

  try {
    const fileName = activePath.split(/[/\\]/).pop() || activePath;
    const result = stripReasoningBlocks(await aiService.formatDocument(content, fileName));
    editorData.model.setValue(result);
    editorManager.pinTab(activePath);
    store.markDirty(activePath);
    showToast('AI 格式化完成，已自动剥离思考内容', 'success');
    if (btn) {
      btn.innerHTML = '已完成';
      btn.classList.remove('loading');
      btn.classList.add('success');
    }
  } catch (err) {
    console.error('[Files] AI format failed:', err);
    showToast('AI 格式化失败：' + (err instanceof Error ? err.message : String(err)), 'error');
    if (btn) {
      btn.innerHTML = '失败';
      btn.classList.remove('loading');
    }
  } finally {
    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        btn.classList.remove('success', 'loading');
        btn.title = 'AI Format';
      }
      isAiFormatRunning = false;
    }, 700);
  }
}

function bindFilesToolbar(): void {
  const hasToolbar = Boolean(document.getElementById('btn-open-folder') || document.getElementById('btn-open-folder-files') || document.querySelector('.file-sidebar-actions'));
  if (!hasToolbar || filesToolbarBound) return;
  filesToolbarBound = true;
  ensureFileEditorActions();
  bindFileAIWorkflowBar();
  document.getElementById('btn-open-folder')?.addEventListener('click', () => {
    console.debug('[Files] open-folder click');
    chooseAndOpenWorkspace();
  });
  document.getElementById('btn-open-folder-files')?.addEventListener('click', () => {
    console.debug('[Files] open-folder-files click');
    chooseAndOpenWorkspace();
  });
  document.getElementById('btn-new-file')?.addEventListener('click', () => handleNewFile());
  document.getElementById('btn-new-folder')?.addEventListener('click', () => handleNewFolder());
  document.getElementById('btn-ai-format-toolbar')?.addEventListener('click', async () => {
    console.debug('[Files] AI format toolbar click');
    await runAiFormatCurrentFile(document.getElementById('btn-ai-format-toolbar') as HTMLButtonElement | null);
  });
  document.getElementById('btn-refresh-tree')?.addEventListener('click', async () => {
    await fileTree?.refresh();
    showToast('文件树已刷新', 'success');
  });
  document.getElementById('btn-reveal-active-file')?.addEventListener('click', async () => {
    const activePath = store.getActiveFilePath();
    if (!activePath) {
      showToast('当前没有打开的文件', 'info');
      return;
    }
    await fileTree?.revealPath(activePath);
  });
  document.getElementById('btn-quick-open-file')?.addEventListener('click', () => { void openQuickOpen(); });
}

function initDragDrop(): void {
  const pageFiles = document.getElementById('page-files');
  if (!pageFiles) return;

  pageFiles.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    pageFiles.classList.add('drag-over');
  });

  pageFiles.addEventListener('dragleave', (e) => {
    e.preventDefault();
    pageFiles.classList.remove('drag-over');
  });

  pageFiles.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    pageFiles.classList.remove('drag-over');

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const filePath = (file as any).path;
    if (!filePath) return;

    try {
      await ipcClient.fs.readDirectory(filePath);
      // If successful, it's a directory
      if (fileTree && editorManager) {
        await openWorkspaceRoot(filePath, { restoreSession: true });
      }
    } catch {
      // Not a directory - open as file
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      await editorManager?.openFile(filePath, fileName);
    }
  });
}

async function initFilesPage(): Promise<void> {
  if (fileTree) return;

  const treeContainer = document.getElementById('file-tree');
  const editorContainer = document.getElementById('editor-container');
  const tabsList = document.getElementById('tabs-list');

  if (!treeContainer || !editorContainer || !tabsList) return;

  bindFilesToolbar();

  fileTree = new FileTree(treeContainer);
  editorManager = new EditorManager(editorContainer, tabsList);
  editorManager.attachStore(store);
  store.subscribe(() => scheduleWorkspaceSessionSave());

  setRuntime('fileTree', fileTree);
  setRuntime('editorManager', editorManager);
  setRuntime('filesStore', store);
  setRuntime('openWorkspaceRoot', openWorkspaceRoot);
  setRuntime('chooseWorkspaceFolder', chooseAndOpenWorkspace);
  setRuntime('openFilePath', async (filePath: string) => {
    if (!editorManager) return;
    await editorManager.openPath(filePath);
  });
  setRuntime('getActiveFileSnapshot', () => editorManager?.getActiveFileSnapshot?.() || null);

  // 事件总线注册（解耦跨页调用，逐步替代 window.__*）
  bus.on(BusEvents.EditorSave, () => editorManager?.saveFile?.());
  bus.on(BusEvents.EditorCloseActive, () => {
    if (editorManager?.activeEditor) editorManager.closeTab(editorManager.activeEditor);
  });
  bus.on(BusEvents.EditorRunCommand, (action) => {
    if (!editorManager?.activeEditor) {
      toast('请先在文件管理器中打开一个 Markdown 文档');
      return;
    }
    editorManager.runMarkdownCommand?.(action as string);
  });
  bus.on(BusEvents.EditorSetMode, (mode) => {
    if (!editorManager?.activeEditor) {
      toast('请先在文件管理器中打开一个 Markdown 文档');
      return;
    }
    editorManager.setMarkdownMode?.(mode as 'edit' | 'preview' | 'split');
  });
  bus.on(BusEvents.FileOpenFolder, () => {
    if (fileTree) fileTree.openFolder();
    else getRuntime('chooseWorkspaceFolder')?.();
  });
  bus.on(BusEvents.FileRunAIWorkflow, (id) => {
    if (typeof runFileAIWorkflow === 'function') runFileAIWorkflow(id as string);
    else toast('文件管理器还没有准备好');
  });
  installFileCopilot({
    runWorkflow: runFileAIWorkflow,
    getSnapshot: () => editorManager?.getActiveFileSnapshot?.() || null,
  });

  fileTree.onFileSelect = (filePath, fileName) => {
    editorManager?.openFile(filePath, fileName);
    window.dispatchEvent(new CustomEvent('nova:active-file-changed'));
  };

  fileTree.onFolderSelect = (folderPath) => {
    const root = fileTree?.getWorkspaceRoot() || folderPath;
    if (store.getWorkspaceRoot() !== root) {
      store.resetForWorkspace(root);
    }
    store.setSelectedFolder(folderPath);
    updateBreadcrumb(folderPath);
  };

  fileTree.onFileRenamed = (oldPath, newPath, isDir) => {
    if (isDir) {
      const targets = store.getState().openTabs.filter((tabPath) => tabPath.startsWith(oldPath));
      for (const target of targets) {
        const relative = target.slice(oldPath.length);
        const updatedPath = newPath + relative;
        const updatedName = updatedPath.split(/[/\\\\]/).pop() || target;
        editorManager?.renameTab(target, updatedPath, updatedName);
      }
      return;
    }

    const fileName = newPath.split(/[/\\\\]/).pop() || '';
    editorManager?.renameTab(oldPath, newPath, fileName);
  };

  fileTree.onFileDeleted = (itemPath, isDir) => {
    if (isDir) {
      const deletedPaths = store.closeFilesUnderDir(itemPath);
      editorManager?.closeTabsForDeletedPaths(deletedPaths);
      return;
    }

    editorManager?.closeTab(itemPath, { force: true });
  };

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      editorManager?.saveFile();
    }
  });

  // Restore previous workspace session. Prefer workspace-store, then fall back to legacy localStorage.
  try {
    const workspaces = await ipcClient.workspace.list();
    const saved = FilesStore.restoreState();
    const rootToRestore = saved.workspaceRoot || workspaces[0]?.rootPath || null;
    if (rootToRestore) {
      const hasWorkspaceSession = await ipcClient.workspace.getSession(rootToRestore);
      if (hasWorkspaceSession) {
        await openWorkspaceRoot(rootToRestore, { restoreSession: true });
      } else {
        await openWorkspaceRoot(rootToRestore, { restoreSession: false });
        for (const tabPath of saved.openTabs) {
          const fileName = tabPath.split(/[/\\]/).pop() || tabPath;
          await editorManager.openFile(tabPath, fileName);
          editorManager.pinTab(tabPath);
        }
        if (saved.activeTab && saved.openTabs.includes(saved.activeTab)) {
          editorManager.switchToTab(saved.activeTab);
        }
      }
    }
  } catch (err) {
    console.warn('[Files] Failed to restore workspace session:', err);
  }

  // Initialize drag-and-drop
  initDragDrop();

// --- File Search ---
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
const searchInput = document.getElementById('files-search-input');
if (searchInput) {
  searchInput.addEventListener('input', () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const query = (searchInput as HTMLInputElement).value.trim().toLowerCase();
      if (!query) {
        fileTree?.clearSearchHighlight();
        return;
      }
      fileTree?.searchAndHighlight(query);
    }, 200);
  });
  // Ctrl+F focuses the file tree filter. Ctrl+P is reserved for Quick Open.
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      searchInput.focus();
    }
  });
}


  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      void openQuickOpen();
    }
  });

  window.addEventListener('beforeunload', () => { void flushWorkspaceSession(); });

  // T3: block window close / app quit while there are unsaved editor tabs.
  // Electron fires `beforeunload` for both the title-bar close and programmatic
  // close, so this single guard covers every exit path.
  window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
    if (store.getState().dirtySet.length > 0) {
      e.preventDefault();
      e.returnValue = '有未保存的文件，确定要离开吗？';
    }
  });

  // ── 文件系统监听（外部变化自动刷新）──
  let fsWatchCleanup: (() => void) | null = null;
  let fsRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  function startFsWatch(rootPath: string): void {
    stopFsWatch();
    ipcClient.fsWatch.watch(rootPath);
    fsWatchCleanup = ipcClient.fsWatch.onChanged((payload) => {
      if (payload.rootPath !== rootPath) return;
      if (fsRefreshTimer) clearTimeout(fsRefreshTimer);
      fsRefreshTimer = setTimeout(() => {
        fsRefreshTimer = null;
        void fileTree?.refresh();
      }, 500);
    });
  }

  function stopFsWatch(): void {
    if (fsWatchCleanup) {
      fsWatchCleanup();
      fsWatchCleanup = null;
    }
    if (fsRefreshTimer) {
      clearTimeout(fsRefreshTimer);
      fsRefreshTimer = null;
    }
    const root = fileTree?.getWorkspaceRoot();
    if (root) ipcClient.fsWatch.unwatch(root);
  }

  // Hook into workspace changes
  const origOpen = openWorkspaceRoot;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__openWorkspaceRoot = async (rootPath: string, opts?: Record<string, unknown>) => {
    await origOpen(rootPath, opts as any);
    startFsWatch(rootPath);
  };

  // Start watching the currently restored workspace (if any)
  const initialRoot = fileTree?.getWorkspaceRoot();
  if (initialRoot) startFsWatch(initialRoot);

  window.addEventListener('beforeunload', () => stopFsWatch());

  if (process.env.NODE_ENV !== 'production') console.log('[Files] page initialized');
}

bindFilesToolbar();
setRuntime('handleNewFile', handleNewFile);
setRuntime('handleNewFileFromTemplate', handleNewFileFromTemplate);
setRuntime('runFileAIWorkflow', runFileAIWorkflow);

// 模块级事件（函数在本模块已就绪，无需等待页面初始化）
bus.on(BusEvents.FileNew, () => handleNewFile());
bus.on(BusEvents.FileNewFromTemplate, (id) => handleNewFileFromTemplate(id as string));

registerPageInit('files' as PageId, initFilesPage);

export { initFilesPage, fileTree, editorManager, store };