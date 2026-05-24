/**
 * EditorManager - Monaco Editor Manager
 * Manages Monaco editor instances, tab rendering, and editor lifecycle.
 * Supports VSCode-style tabs: preview tabs, pinned tabs, scroll overflow,
 * right-click context menu, middle-click close.
 */
import { ipcClient } from '../../services/ipc-client';
import type { FilesStore } from './files-store';


interface MonacoEditor {
  create(container: HTMLElement, options: Record<string, unknown>): MonacoEditorInstance;
  defineTheme(name: string, config: Record<string, unknown>): void;
}

interface MonacoEditorInstance {
  setModel(model: MonacoModel | null): void;
  getModel(): MonacoModel | null;
  layout(): void;
  getPosition(): { lineNumber: number; column: number } | null;
}

interface MonacoModel {
  getValue(): string;
  setValue(value: string): void;
  getLanguageId(): string;
  dispose(): void;
  getFullModelRange(): { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
  pushEditOperations(before: unknown[], operations: unknown[], fn: (() => null) | null): void;
}

interface MonacoStatic {
  editor: MonacoEditor;
}

interface EditorTab {
  filePath: string;
  fileName: string;
  model: MonacoModel;
  viewState: unknown;
  isPreview: boolean;
}

declare global {
  interface Window {
    monaco: any;
    require: any;
  }
}

export class EditorManager {
  private container: HTMLElement;
  private tabsList: HTMLElement;
  private editors = new Map<string, EditorTab>();
  private tabElements = new Map<string, HTMLElement>();
  private activeEditorPath: string | null = null;
  private previewPath: string | null = null;
  private monaco: MonacoStatic | null = null;
  private editor: MonacoEditorInstance | null = null;
  private store: FilesStore | null = null;
  private _closeTabCtxMenu: (() => void) | null = null;

  constructor(container: HTMLElement, tabsList: HTMLElement) {
    this.container = container;
    this.tabsList = tabsList;
  }

  attachStore(store: FilesStore): void {
    this.store = store;
  }

  get activeEditor(): string | null {
    return this.activeEditorPath;
  }

  getEditorByPath(filePath: string): EditorTab | undefined {
    return this.editors.get(filePath);
  }

  async init(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        if (window.monaco) {
          this.monaco = window.monaco;
          this.createEditor();
          resolve();
          return;
        }

        const monacoPath = 'node_modules/monaco-editor/min/vs';
        window.require.config({ paths: { vs: monacoPath } });
        window.require(
          ['vs/editor/editor.main'],
          (m: MonacoStatic) => {
            this.monaco = m;
            this.createEditor();
            resolve();
          },
          (err: Error) => {
            console.error('[EditorManager] Monaco load failed:', err);
            reject(err);
          }
        );
      } catch (err) {
        console.error('[EditorManager] init error:', err);
        reject(err);
      }
    });
  }

  private createEditor(): void {
    this.container.innerHTML = '';

    this.monaco.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0a0a0f',
        'editor.foreground': '#f0f0f5',
        'editor.lineHighlightBackground': '#1a1a24',
        'editor.selectionBackground': '#2a2a3a',
        'editorCursor.foreground': '#6366f1',
        'editorLineNumber.foreground': '#555570',
        'editorLineNumber.activeForeground': '#8888a0',
        'editor.inactiveSelectionBackground': '#222230',
        'editorIndentGuide.background': '#222230',
        'editorIndentGuide.activeBackground': '#2a2a3a',
        'editorWidget.background': '#111118',
        'editorSuggestWidget.background': '#111118',
        'editorSuggestWidget.selectedBackground': '#222230',
      },
    });

    this.monaco.editor.defineTheme('custom-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#fafafa',
        'editor.foreground': '#1a1a2e',
        'editor.lineHighlightBackground': '#f5f5f7',
        'editor.selectionBackground': '#e5e5e7',
        'editorCursor.foreground': '#6366f1',
        'editorLineNumber.foreground': '#9999aa',
        'editorLineNumber.activeForeground': '#6b6b80',
        'editor.inactiveSelectionBackground': '#eeeeef',
        'editorIndentGuide.background': '#eeeeef',
        'editorIndentGuide.activeBackground': '#e5e5e7',
        'editorWidget.background': '#ffffff',
        'editorSuggestWidget.background': '#ffffff',
        'editorSuggestWidget.selectedBackground': '#eeeeef',
      },
    });

    this.editor = this.monaco.editor.create(this.container, {
      value: '',
      language: 'plaintext',
      theme: this.getCurrentTheme(),
      automaticLayout: true,
      fontSize: 14,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      padding: { top: 16, bottom: 16 },
      unicodeHighlight: {
        invisible: false,
        ambiguousCharacters: false,
        nonBasicASCII: false,
      },
      showUnicodeHighlightDialog: false,
    });
  }

  private getCurrentTheme(): string {
    return document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'custom-dark'
      : 'custom-light';
  }

  async openFile(filePath: string, fileName: string): Promise<void> {
    try {
      // File already open — just switch to it
      if (this.editors.has(filePath)) {
        this.switchToTab(filePath);
        return;
      }

      if (!this.monaco) {
        await this.init();
      }

      if (!this.editor) {
        console.error('[EditorManager] Editor not initialized');
        return;
      }

      const content = await ipcClient.fs.readFile(filePath);
      const language = this.detectLanguage(fileName);
      const model = this.monaco.editor.createModel(content, language);

      // Check if we can replace the current preview tab
      const previewTab = this.previewPath ? this.editors.get(this.previewPath) : null;
      const previewEl = this.previewPath ? this.tabElements.get(this.previewPath) : null;

      if (previewTab && previewEl && this.previewPath) {
        const oldPath = this.previewPath;

        // Dispose old model
        try {
          previewTab.model.dispose();
        } catch (e) {
          console.warn('[EditorManager] preview model dispose failed:', e);
        }

        // Update tab data
        previewTab.filePath = filePath;
        previewTab.fileName = fileName;
        previewTab.model = model;
        previewTab.viewState = null;
        previewTab.isPreview = true;

        // Update maps
        this.editors.delete(oldPath);
        this.editors.set(filePath, previewTab);
        this.tabElements.delete(oldPath);
        this.tabElements.set(filePath, previewEl);

        // Update DOM
        previewEl.dataset.path = filePath;
        const nameSpan = previewEl.querySelector('.tab-name');
        if (nameSpan) nameSpan.textContent = fileName;
        previewEl.classList.add('preview');

        // Update store
        this.store?.closeFile(oldPath);
        this.store?.openFile(filePath);
        this.store?.setActive(filePath);

        // Set editor model
        this.editor.setModel(model);
        this.activeEditorPath = filePath;
        this.previewPath = filePath;

        // Content change: auto-pin on edit
        model.onDidChangeContent(() => {
          const tab = this.editors.get(filePath);
          if (tab?.isPreview) {
            this.pinTab(filePath);
          }
          const tabEl = this.tabElements.get(filePath);
          tabEl?.classList.add('modified');
          this.store?.markDirty(filePath);
        });

        // Update active states
        this.tabElements.forEach((el, key) => {
          el.classList.toggle('active', key === filePath);
        });

        this.updateStatusBar();
        setTimeout(() => this.editor?.layout(), 50);
        return;
      }

      // No preview to replace — create a new preview tab
      const tab: EditorTab = { filePath, fileName, model, viewState: null, isPreview: true };
      this.editors.set(filePath, tab);
      this.activeEditorPath = filePath;
      this.previewPath = filePath;
      this.createTab(filePath, fileName, true);
      this.store?.openFile(filePath);
      this.store?.setActive(filePath);

      // Content change: auto-pin on edit
      model.onDidChangeContent(() => {
        const t = this.editors.get(filePath);
        if (t?.isPreview) {
          this.pinTab(filePath);
        }
        const tabEl = this.tabElements.get(filePath);
        tabEl?.classList.add('modified');
        this.store?.markDirty(filePath);
      });

      this.updateStatusBar();
    } catch (err) {
      console.error('[EditorManager] openFile failed:', err);
    }
  }

  private createTab(filePath: string, fileName: string, isPreview: boolean): void {
    const tab = document.createElement('div');
    tab.className = 'tab active' + (isPreview ? ' preview' : '');
    tab.dataset.path = filePath;
    tab.innerHTML =
      '<span class="tab-name">' + this.escHTML(fileName) + '</span>' +
      '<button class="tab-close" title="\u5173\u95ED">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
      '</button>';

    // Single-click to switch
    tab.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.tab-close')) return;
      this.switchToTab(filePath);
    });

    // Double-click to pin
    tab.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('.tab-close')) return;
      this.pinTab(filePath);
    });

    // Close button
    tab.querySelector('.tab-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(filePath);
    });

    // Middle-click to close
    tab.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        this.closeTab(filePath);
      }
    });

    // Right-click context menu
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showTabContextMenu(e, filePath);
    });

    // Deactivate other tabs
    this.tabsList.querySelectorAll('.tab').forEach((el) => el.classList.remove('active'));
    this.tabsList.appendChild(tab);
    this.tabElements.set(filePath, tab);
  }

  // --- Pin / Unpin ---

  pinTab(filePath: string): void {
    const tab = this.editors.get(filePath);
    if (!tab || !tab.isPreview) return;

    tab.isPreview = false;
    const tabEl = this.tabElements.get(filePath);
    tabEl?.classList.remove('preview');

    // Update store
    this.store?.pinFile(filePath);

    // Clear previewPath if this was the preview
    if (this.previewPath === filePath) {
      this.previewPath = null;
    }
  }

  // --- Tab Context Menu ---

  private showTabContextMenu(e: MouseEvent, filePath: string): void {
    this.removeTabContextMenu();
    const menu = document.createElement('div');
    menu.className = 'tab-context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    const tab = this.editors.get(filePath);
    const isPreview = tab?.isPreview ?? false;

    const items: { label: string; action: () => void }[] = [];

    // Show "固定标签" only for preview tabs
    if (isPreview) {
      items.push({ label: '\u56FA\u5B9A\u6807\u7B7E', action: () => this.pinTab(filePath) });
    }

    items.push(
      { label: '\u5173\u95ED', action: () => this.closeTab(filePath) },
      { label: '\u5173\u95ED\u5176\u4ED6', action: () => this.closeOtherTabs(filePath) },
      { label: '\u5173\u95ED\u6240\u6709', action: () => this.closeAllTabs() },
      { label: '\u5173\u95ED\u5DF2\u4FDD\u5B58', action: () => this.closeSavedTabs() },
    );

    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'tab-context-item';
      el.textContent = item.label;
      el.addEventListener('click', () => { this.removeTabContextMenu(); item.action(); });
      menu.appendChild(el);
    }

    document.body.appendChild(menu);
    setTimeout(() => {
      document.addEventListener('click', this._closeTabCtxMenu = () => this.removeTabContextMenu(), { once: true });
    }, 0);
  }

  private removeTabContextMenu(): void {
    document.querySelectorAll('.tab-context-menu').forEach(el => el.remove());
  }

  private closeOtherTabs(keepPath: string): void {
    const paths = Array.from(this.editors.keys()).filter(p => p !== keepPath);
    for (const p of paths) this.closeTab(p, { force: true });
  }

  private closeAllTabs(): void {
    const paths = Array.from(this.editors.keys());
    for (const p of paths) this.closeTab(p, { force: true });
  }

  private closeSavedTabs(): void {
    const paths = Array.from(this.editors.keys()).filter(p => !this.store?.isDirty(p));
    for (const p of paths) this.closeTab(p, { force: true });
  }

  // --- Tab Switching ---

  switchToTab(filePath: string): void {
    const tab = this.editors.get(filePath);
    if (!tab || !this.editor) return;

    if (this.activeEditorPath) {
      const current = this.editors.get(this.activeEditorPath);
      if (current) current.viewState = this.editor.saveViewState();
    }

    this.editor.setModel(tab.model);
    if (tab.viewState) this.editor.restoreViewState(tab.viewState);
    this.activeEditorPath = filePath;

    this.tabElements.forEach((el, key) => {
      el.classList.toggle('active', key === filePath);
    });

    this.store?.setActive(filePath);
    this.updateStatusBar();
    setTimeout(() => this.editor?.layout(), 50);
  }

  async closeTab(filePath: string, options?: { force?: boolean }): Promise<void> {
    const tab = this.editors.get(filePath);
    if (!tab) {
      this.removeTabElement(filePath);
      return;
    }

    if (!options?.force && this.store?.isDirty(filePath)) {
      const shouldClose = window.confirm('\u6587\u4EF6\u6709\u672A\u4FDD\u5B58\u7684\u66F4\u6539\uFF0C\u786E\u5B9A\u5173\u95ED\u5417\uFF1F');
      if (!shouldClose) return;
    }

    const remaining = Array.from(this.editors.keys()).filter((key) => key !== filePath);
    const nextActive = this.activeEditorPath === filePath ? (remaining[remaining.length - 1] ?? null) : this.activeEditorPath;

    try {
      tab.model.dispose();
    } catch (error) {
      console.warn('[EditorManager] model dispose failed:', error);
    }

    // Clear previewPath if closing the preview tab
    if (this.previewPath === filePath) {
      this.previewPath = null;
    }

    this.editors.delete(filePath);
    this.store?.clearDirty(filePath);
    this.removeTabElement(filePath);
    this.store?.closeFile(filePath);

    if (nextActive && this.editors.has(nextActive)) {
      this.switchToTab(nextActive);
      return;
    }

    this.activeEditorPath = null;
    this.editor?.setModel(null);
    this.store?.setActive(null);
    this.showWelcomeScreen();
  }

  renameTab(oldPath: string, newPath: string, newFileName: string): void {
    const tab = this.editors.get(oldPath);
    if (!tab) return;

    tab.filePath = newPath;
    tab.fileName = newFileName;
    this.editors.delete(oldPath);
    this.editors.set(newPath, tab);

    const tabEl = this.tabElements.get(oldPath);
    if (tabEl) {
      tabEl.dataset.path = newPath;
      const nameSpan = tabEl.querySelector('.tab-name');
      if (nameSpan) nameSpan.textContent = newFileName;
      this.tabElements.delete(oldPath);
      this.tabElements.set(newPath, tabEl);
    }

    if (this.activeEditorPath === oldPath) {
      this.activeEditorPath = newPath;
    }

    if (this.previewPath === oldPath) {
      this.previewPath = newPath;
    }

    this.store?.renameFile(oldPath, newPath);
    this.updateStatusBar();
  }

  closeTabsForDeletedPaths(deletedPaths: string[]): void {
    for (const filePath of deletedPaths) {
      this.closeTab(filePath, { force: true });
    }
  }

  async saveFile(): Promise<void> {
    if (!this.activeEditorPath || !this.editor) return;
    const tab = this.editors.get(this.activeEditorPath);
    if (!tab) return;

    await ipcClient.fs.writeFile(this.activeEditorPath, tab.model.getValue());
    const tabEl = this.tabElements.get(this.activeEditorPath);
    tabEl?.classList.remove('modified');
    this.store?.clearDirty(this.activeEditorPath);
    this.updateStatusBar();
  }

  private removeTabElement(filePath: string): void {
    const tabEl = this.tabElements.get(filePath);
    if (tabEl) {
      tabEl.remove();
      this.tabElements.delete(filePath);
    }
  }

  private showWelcomeScreen(): void {
    this.container.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg><p>\u9009\u62E9\u4E00\u4E2A\u6587\u4EF6\u5F00\u59CB\u7F16\u8F91</p></div>';
    this.editor = null;
    this.monaco = null;
  }

  private updateStatusBar(): void {
    if (!this.editor) return;
    const pos = this.editor.getPosition();
    const cursorEl = document.getElementById('status-cursor');
    if (cursorEl && pos) {
      cursorEl.textContent = 'Ln ' + pos.lineNumber + ', Col ' + pos.column;
    }
    const langEl = document.getElementById('status-language');
    if (langEl && this.activeEditorPath) {
      const tab = this.editors.get(this.activeEditorPath);
      if (tab) langEl.textContent = tab.model.getLanguageId();
    }
  }

  private detectLanguage(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      json: 'json',
      md: 'markdown',
      html: 'html',
      css: 'css',
      py: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
    };
    return map[ext] ?? 'plaintext';
  }

  private escHTML(str: string): string {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
}