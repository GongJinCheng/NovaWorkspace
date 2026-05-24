/**
 * EditorManager - Monaco Editor Manager
 * Manages Monaco editor instances, tab rendering, and editor lifecycle.
 */
import { ipcClient } from '../../services/ipc-client';
import type { FilesStore } from './files-store';

interface EditorTab {
  filePath: string;
  fileName: string;
  model: any;
  viewState: any;
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
  private monaco: any = null;
  private editor: any = null;
  private store: FilesStore | null = null;

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
          (m: any) => {
            this.monaco = m;
            this.createEditor();
            resolve();
          },
          (err: any) => {
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

      this.editor.setModel(model);

      model.onDidChangeContent(() => {
        const tabEl = this.tabElements.get(filePath);
        tabEl?.classList.add('modified');
        this.store?.markDirty(filePath);
      });

      setTimeout(() => this.editor?.layout(), 50);

      const tab: EditorTab = { filePath, fileName, model, viewState: null };
      this.editors.set(filePath, tab);
      this.activeEditorPath = filePath;

      this.createTabElement(filePath, fileName);
      this.store?.openFile(filePath);
      this.updateStatusBar();
    } catch (err) {
      console.error('[EditorManager] openFile failed:', filePath, err);
    }
  }

  private createTabElement(filePath: string, fileName: string): void {
    const existing = this.tabElements.get(filePath);
    existing?.remove();
    this.tabElements.delete(filePath);

    const tab = document.createElement('div');
    tab.className = 'tab active';
    tab.dataset.path = filePath;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tab-name';
    nameSpan.textContent = fileName;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.title = '关闭';
    closeBtn.textContent = 'x';

    tab.appendChild(nameSpan);
    tab.appendChild(closeBtn);

    tab.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.tab-close')) {
        this.switchToTab(filePath);
      }
    });

    tab.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        this.closeTab(filePath);
      }
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(filePath);
    });

    this.tabsList.querySelectorAll('.tab').forEach((el) => el.classList.remove('active'));
    this.tabsList.appendChild(tab);
    this.tabElements.set(filePath, tab);
  }

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
      const shouldClose = window.confirm('文件有未保存的更改，确定关闭吗？');
      if (!shouldClose) return;
    }

    const remaining = Array.from(this.editors.keys()).filter((key) => key !== filePath);
    const nextActive = this.activeEditorPath === filePath ? (remaining[remaining.length - 1] ?? null) : this.activeEditorPath;

    try {
      tab.model.dispose();
    } catch (error) {
      console.warn('[EditorManager] model dispose failed:', error);
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
    this.container.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg><p>选择一个文件开始编辑</p></div>';
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
}