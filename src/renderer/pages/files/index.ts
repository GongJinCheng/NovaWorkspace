/**
 * Files Page - orchestrates file tree, editor tabs, and file operations.
 * Features: drag-and-drop, state persistence restore.
 */
import { FileTree } from './file-tree';
import { EditorManager } from './editor-manager';
import { FilesStore } from './files-store';
import { ipcClient } from '../../services/ipc-client';
import { registerPageInit, PageId } from '../../app/router';
import { showInputPrompt } from '../../components/modal';
import { aiService } from '../ai/ai-service';
import { createDocumentFromTemplate } from '../../services/template-service';

const store = new FilesStore();
let fileTree: FileTree | null = null;
let editorManager: EditorManager | null = null;
let isRestoringWorkspace = false;
let workspaceSaveTimer: ReturnType<typeof setTimeout> | null = null;
let isAiFormatRunning = false;
let filesToolbarBound = false;
let quickOpenFiles: string[] = [];
let quickOpenSelectedIndex = 0;

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
  const dir = getTargetDir();
  if (!dir) {
    alert('请先打开一个文件夹');
    return;
  }

  await createDocumentFromTemplate(undefined, {
    targetDir: dir,
    afterCreate: async () => { await fileTree?.render(); },
    openFile: async (filePath, fileName) => {
      if (editorManager && filePath) await editorManager.openFile(filePath, fileName);
    },
  });
}

async function handleNewFileFromTemplate(templateId: string): Promise<void> {
  const dir = getTargetDir();
  if (!dir) {
    alert('请先打开一个文件夹');
    return;
  }
  await createDocumentFromTemplate(templateId, {
    targetDir: dir,
    afterCreate: async () => { await fileTree?.render(); },
    openFile: async (filePath, fileName) => {
      if (editorManager && filePath) await editorManager.openFile(filePath, fileName);
    },
  });
}

async function handleNewFolder(): Promise<void> {
  console.debug('[Files] new-folder click');
  const dir = getTargetDir();
  if (!dir) {
    alert('\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u6587\u4EF6\u5939');
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
    alert('\u521B\u5EFA\u6587\u4EF6\u5939\u5931\u8D25: ' + (err instanceof Error ? err.message : String(err)));
  }
}


function showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
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
  const parts = folderPath.replace(root, '').split(/[\/]/).filter(Boolean);
  let html = '<span class="breadcrumb-item" data-path="' + root + '">工作区</span>';
  let accum = root;
  for (const part of parts) {
    accum = accum + (accum.endsWith('/') || accum.endsWith('\\') ? '' : '/') + part;
    html += '<span class="breadcrumb-separator">/</span>';
    html += '<span class="breadcrumb-item" data-path="' + accum + '">' + escHTML(part) + '</span>';
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

function escHTML(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escAttr(s: string): string {
  return escHTML(s).replace(/\"/g, '&quot;');
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
  const matches = quickOpenFiles
    .filter((path) => !q || path.toLowerCase().includes(q))
    .slice(0, 80);

  if (matches.length === 0) {
    results.innerHTML = '<div class="quick-open-empty">没有匹配的文件</div>';
    return;
  }

  results.innerHTML = matches.map((path, index) => {
    const name = path.split(/[/\\]/).pop() || path;
    const root = store.getWorkspaceRoot();
    const relative = root ? path.replace(root, '').replace(/^[/\\]/, '') : path;
    return '<div class="quick-open-item' + (index === quickOpenSelectedIndex ? ' selected' : '') + '" data-path="' + escAttr(path) + '">' +
      '<span class="quick-open-file-name">' + escHTML(name) + '</span>' +
      '<span class="quick-open-file-path">' + escHTML(relative) + '</span>' +
    '</div>';
  }).join('');

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

function updateQuickOpenSelection(): void {
  const items = Array.from(document.querySelectorAll('.quick-open-item')) as HTMLElement[];
  items.forEach((item, index) => item.classList.toggle('selected', index === quickOpenSelectedIndex));
  items[quickOpenSelectedIndex]?.scrollIntoView({ block: 'nearest' });
}

function openQuickOpenFile(filePath: string): void {
  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  closeQuickOpen();
  editorManager?.openFile(filePath, fileName);
  void fileTree?.revealPath(filePath);
}

function bindFilesToolbar(): void {
  const hasToolbar = Boolean(document.getElementById('btn-open-folder') || document.getElementById('btn-open-folder-files') || document.querySelector('.file-sidebar-actions'));
  if (!hasToolbar || filesToolbarBound) return;
  filesToolbarBound = true;
  ensureFileEditorActions();
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
    if (isAiFormatRunning) return;

    await aiService.reloadConfig().catch(() => undefined);
    if (!aiService.isConfigured()) {
      alert('请先在设置页配置 AI 模型');
      return;
    }

    const activePath = store.getActiveFilePath();
    if (!activePath || !editorManager) {
      alert('请先打开一个文件');
      return;
    }

    const editorData = editorManager.getEditorByPath(activePath);
    if (!editorData) return;

    const content = editorData.model.getValue();
    if (!content.trim()) {
      alert('文件内容为空');
      return;
    }

    const btn = document.getElementById('btn-ai-format-toolbar') as HTMLButtonElement | null;
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
      const result = await aiService.formatDocument(content, fileName);
      editorData.model.setValue(result);
      editorManager.pinTab(activePath);
      store.markDirty(activePath);
      if (btn) {
        btn.innerHTML = '已完成';
        btn.classList.remove('loading');
        btn.classList.add('success');
      }
    } catch (err) {
      console.error('[Files] AI format failed:', err);
      alert('AI 格式化失败: ' + (err instanceof Error ? err.message : String(err)));
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

  window.__fileTree = fileTree;
  window.__editorManager = editorManager;
  window.__filesStore = store;
  window.__openWorkspaceRoot = openWorkspaceRoot;
  window.__chooseWorkspaceFolder = chooseAndOpenWorkspace;
  window.__openFilePath = async (filePath: string) => {
    if (!editorManager) return;
    await editorManager.openPath(filePath);
  };
  window.__getActiveFileSnapshot = () => editorManager?.getActiveFileSnapshot?.() || null;

  fileTree.onFileSelect = (filePath, fileName) => {
    editorManager?.openFile(filePath, fileName);
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

  console.log('[Files] page initialized');
}

bindFilesToolbar();
window.__handleNewFile = handleNewFile;
window.__handleNewFileFromTemplate = handleNewFileFromTemplate;

registerPageInit('files' as PageId, initFilesPage);

export { initFilesPage, fileTree, editorManager, store };