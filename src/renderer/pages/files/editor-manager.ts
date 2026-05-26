/**
 * EditorManager - Monaco Editor Manager
 * Manages Monaco editor instances, tab rendering, and editor lifecycle.
 * Supports VSCode-style tabs: preview tabs, pinned tabs, scroll overflow,
 * right-click context menu, middle-click close.
 */
import { ipcClient } from '../../services/ipc-client';
import { aiService } from '../ai/ai-service';
import type { FilesStore } from './files-store';
import { isMarkdownFile, renderMarkdownToHtml } from './markdown-preview';
import { showInputPrompt } from '../../components/modal';


interface MonacoEditor {
  create(container: HTMLElement, options: Record<string, unknown>): MonacoEditorInstance;
  createModel(value: string, language: string): MonacoModel;
  defineTheme(name: string, config: Record<string, unknown>): void;
}

interface MonacoEditorInstance {
  setModel(model: MonacoModel | null): void;
  getModel(): MonacoModel | null;
  layout(): void;
  getPosition(): { lineNumber: number; column: number } | null;
  saveViewState(): unknown;
  restoreViewState(state: unknown): void;
  getSelection(): MonacoRange | null;
}

interface MonacoRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

interface MonacoModel {
  getValue(): string;
  setValue(value: string): void;
  getLanguageId(): string;
  dispose(): void;
  getFullModelRange(): MonacoRange;
  getValueInRange(range: MonacoRange): string;
  pushEditOperations(before: unknown[], operations: unknown[], fn: (() => null) | null): void;
  onDidChangeContent(listener: () => void): { dispose(): void };
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

type MarkdownViewMode = 'edit' | 'preview' | 'split';

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
  private editorHost: HTMLElement | null = null;
  private markdownPreview: HTMLElement | null = null;
  private markdownToolbar: HTMLElement | null = null;
  private markdownMode: MarkdownViewMode = 'edit';
  private markdownPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  private markdownAiBusy = false;
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
    this.editorHost = null;
    this.markdownPreview = null;
    this.markdownToolbar = null;

    const monaco = this.monaco;
    if (!monaco) return;

    monaco.editor.defineTheme('custom-dark', {
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

    monaco.editor.defineTheme('custom-light', {
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

    const shell = document.createElement('div');
    shell.className = 'editor-shell';
    shell.innerHTML =
      '<div class="markdown-toolbar" data-visible="false">' +
        '<div class="markdown-mode-group">' +
          '<button class="markdown-tool-btn active" data-md-mode="edit" title="仅编辑">编辑</button>' +
          '<button class="markdown-tool-btn" data-md-mode="preview" title="仅预览">预览</button>' +
          '<button class="markdown-tool-btn" data-md-mode="split" title="分屏编辑预览">分屏</button>' +
        '</div>' +
        '<div class="markdown-ai-group">' +
          '<button class="markdown-tool-btn" data-md-action="summary">AI 总结</button>' +
          '<button class="markdown-tool-btn" data-md-action="outline">生成大纲</button>' +
          '<button class="markdown-tool-btn" data-md-action="rewrite">改写选中</button>' +
          '<button class="markdown-tool-btn" data-md-action="askdoc">问当前文档</button>' +
          '<button class="markdown-tool-btn primary" data-md-action="todo">生成待办</button>' +
        '</div>' +
      '</div>' +
      '<div class="markdown-workspace">' +
        '<div class="monaco-editor-host"></div>' +
        '<article class="markdown-preview-pane" aria-label="Markdown Preview"></article>' +
      '</div>';
    this.container.appendChild(shell);
    this.editorHost = shell.querySelector('.monaco-editor-host');
    this.markdownPreview = shell.querySelector('.markdown-preview-pane');
    this.markdownToolbar = shell.querySelector('.markdown-toolbar');
    this.bindMarkdownToolbar();

    this.editor = monaco.editor.create(this.editorHost || this.container, {
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

    this.applyMarkdownMode();
  }


  private bindMarkdownToolbar(): void {
    if (!this.markdownToolbar) return;

    this.markdownToolbar.addEventListener('click', async (event) => {
      const target = event.target as HTMLElement;
      const modeButton = target.closest('[data-md-mode]') as HTMLElement | null;
      const actionButton = target.closest('[data-md-action]') as HTMLButtonElement | null;

      if (modeButton) {
        this.markdownMode = (modeButton.dataset.mdMode as MarkdownViewMode) || 'edit';
        this.applyMarkdownMode();
        return;
      }

      if (actionButton) {
        await this.runMarkdownAiAction(actionButton.dataset.mdAction || '', actionButton);
      }
    });
  }

  private isActiveMarkdown(): boolean {
    return !!this.activeEditorPath && isMarkdownFile(this.activeEditorPath);
  }

  private updateMarkdownChrome(): void {
    const visible = this.isActiveMarkdown();
    if (this.markdownToolbar) {
      this.markdownToolbar.dataset.visible = visible ? 'true' : 'false';
    }
    if (!visible) {
      this.markdownMode = 'edit';
    }
    this.applyMarkdownMode();
  }

  private applyMarkdownMode(): void {
    const isMd = this.isActiveMarkdown();
    const mode = isMd ? this.markdownMode : 'edit';
    const workspace = this.container.querySelector('.markdown-workspace') as HTMLElement | null;

    workspace?.setAttribute('data-md-mode', mode);
    this.markdownToolbar?.querySelectorAll('[data-md-mode]').forEach((button) => {
      const el = button as HTMLElement;
      el.classList.toggle('active', el.dataset.mdMode === mode);
    });

    if (this.markdownPreview) {
      this.markdownPreview.hidden = !isMd || mode === 'edit';
    }
    if (this.editorHost) {
      this.editorHost.hidden = isMd && mode === 'preview';
    }

    if (isMd) this.updateMarkdownPreview();
    setTimeout(() => this.editor?.layout(), 50);
  }

  private scheduleMarkdownPreviewUpdate(): void {
    if (!this.isActiveMarkdown()) return;
    if (this.markdownPreviewTimer) clearTimeout(this.markdownPreviewTimer);
    this.markdownPreviewTimer = setTimeout(() => this.updateMarkdownPreview(), 120);
  }

  private updateMarkdownPreview(): void {
    if (!this.markdownPreview || !this.activeEditorPath) return;
    const tab = this.editors.get(this.activeEditorPath);
    if (!tab || !this.isActiveMarkdown()) return;
    this.markdownPreview.innerHTML = renderMarkdownToHtml(tab.model.getValue());
  }

  private async runMarkdownAiAction(action: string, button: HTMLButtonElement): Promise<void> {
    if (this.markdownAiBusy) return;
    if (!this.activeEditorPath) return;

    const tab = this.editors.get(this.activeEditorPath);
    if (!tab) return;
    await aiService.reloadConfig().catch(() => undefined);
    if (!aiService.isConfigured()) {
      window.alert('请先在设置页配置 AI 模型，并点击“保存配置”。');
      return;
    }

    this.markdownAiBusy = true;
    const originalText = button.textContent || '';
    button.disabled = true;
    button.textContent = action === 'rewrite' ? '改写中...' : action === 'outline' || action === 'todo' ? '生成中...' : action === 'askdoc' ? '思考中...' : '总结中...';

    try {
      if (action === 'rewrite') {
        await this.rewriteSelectedMarkdown(tab);
        this.scheduleMarkdownPreviewUpdate();
        button.textContent = '已改写';
        return;
      }

      const content = tab.model.getValue();
      if (!content.trim()) {
        window.alert('当前 Markdown 文档为空');
        return;
      }

      if (action === 'askdoc') {
        const question = await showInputPrompt('问当前文档', '请输入你想基于当前文档问 AI 的问题', '请总结当前文档，并指出下一步应该做什么');
        if (!question?.trim()) return;
        const result = await aiService.chat([
          { role: 'system', content: '你正在帮助用户处理当前 Markdown 文档。请基于文档内容回答，不要编造文档中不存在的信息。用中文输出。' },
          { role: 'user', content: `文件路径：${tab.filePath}

文档内容：
${content}

用户问题：${question}` },
        ], { temperature: 0.4 });
        this.showMarkdownAiResult('当前文档问答', result, tab);
        button.textContent = '完成';
        return;
      }

      if (action === 'todo') {
        await this.generateTodosFromMarkdown(tab);
        button.textContent = '已生成';
        return;
      }

      const result = action === 'outline'
        ? await aiService.chat([
            { role: 'system', content: '为下面的 Markdown 文档生成一份结构清晰的中文大纲。只输出大纲。' },
            { role: 'user', content },
          ], { temperature: 0.4 })
        : await aiService.summarize(content);

      this.showMarkdownAiResult(action === 'outline' ? 'Markdown 大纲' : 'Markdown 总结', result, tab);
      button.textContent = '完成';
    } catch (error) {
      console.error('[EditorManager] Markdown AI action failed:', error);
      window.alert('AI 操作失败: ' + (error instanceof Error ? error.message : String(error)));
      button.textContent = '失败';
    } finally {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText;
        this.markdownAiBusy = false;
      }, 700);
    }
  }

  private async rewriteSelectedMarkdown(tab: EditorTab): Promise<void> {
    if (!this.editor) return;
    const selection = this.editor.getSelection();
    if (!selection) return;

    const selected = tab.model.getValueInRange(selection).trim();
    if (!selected) {
      window.alert('请先选中要改写的 Markdown 内容');
      return;
    }

    const rewritten = await aiService.chat([
      { role: 'system', content: '请改写用户选中的 Markdown 内容，使其更清晰、自然、结构更好。保持 Markdown 格式，只输出改写后的正文。' },
      { role: 'user', content: selected },
    ], { temperature: 0.5 });

    tab.model.pushEditOperations([], [{ range: selection, text: rewritten }], () => null);
    this.pinTab(tab.filePath);
    const tabEl = this.tabElements.get(tab.filePath);
    tabEl?.classList.add('modified');
    this.store?.markDirty(tab.filePath);
  }

  private showMarkdownAiResult(title: string, content: string, tab?: EditorTab): void {
    let modal = document.querySelector('.markdown-ai-modal') as HTMLElement | null;
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'markdown-ai-modal';
      modal.innerHTML =
        '<div class="markdown-ai-modal-card">' +
          '<div class="markdown-ai-modal-header">' +
            '<h3></h3>' +
            '<button class="markdown-ai-modal-close" title="关闭">×</button>' +
          '</div>' +
          '<pre class="markdown-ai-modal-content"></pre>' +
          '<div class="markdown-ai-modal-actions">' +
            '<button class="markdown-ai-copy-btn">复制结果</button>' +
            '<button class="markdown-ai-insert-btn">插入到当前文档</button>' +
            '<button class="markdown-ai-todo-btn">生成待办</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
      modal.querySelector('.markdown-ai-modal-close')?.addEventListener('click', () => modal?.remove());
      modal.addEventListener('click', (event) => {
        if (event.target === modal) modal?.remove();
      });
    }

    const titleEl = modal.querySelector('h3');
    const contentEl = modal.querySelector('.markdown-ai-modal-content') as HTMLElement | null;
    if (titleEl) titleEl.textContent = title;
    if (contentEl) contentEl.textContent = content;

    const getText = () => (modal?.querySelector('.markdown-ai-modal-content') as HTMLElement | null)?.textContent || '';
    const copyBtn = modal.querySelector('.markdown-ai-copy-btn') as HTMLButtonElement | null;
    const insertBtn = modal.querySelector('.markdown-ai-insert-btn') as HTMLButtonElement | null;
    const todoBtn = modal.querySelector('.markdown-ai-todo-btn') as HTMLButtonElement | null;

    if (copyBtn) copyBtn.onclick = async () => { await navigator.clipboard?.writeText(getText()); copyBtn.textContent = '已复制'; setTimeout(() => copyBtn.textContent = '复制结果', 900); };
    if (insertBtn) insertBtn.onclick = () => {
      const current = tab || (this.activeEditorPath ? this.editors.get(this.activeEditorPath) : undefined);
      if (!current || !this.editor) return;
      const position = this.editor.getPosition();
      const line = position?.lineNumber || current.model.getFullModelRange().endLineNumber;
      const column = position?.column || 1;
      current.model.pushEditOperations([], [{ range: { startLineNumber: line, startColumn: column, endLineNumber: line, endColumn: column }, text: '\n\n' + getText() + '\n' }], () => null);
      this.pinTab(current.filePath);
      this.store?.markDirty(current.filePath);
      this.scheduleMarkdownPreviewUpdate();
      insertBtn.textContent = '已插入';
      setTimeout(() => insertBtn.textContent = '插入到当前文档', 900);
    };
    if (todoBtn) todoBtn.onclick = async () => {
      const current = tab || (this.activeEditorPath ? this.editors.get(this.activeEditorPath) : undefined);
      await this.createTodosFromText(getText(), current);
    };

    modal.classList.add('show');
  }

  private async generateTodosFromMarkdown(tab: EditorTab): Promise<void> {
    await this.createTodosFromText(tab.model.getValue(), tab, true);
  }

  private async createTodosFromText(content: string, tab?: EditorTab, useAi = false): Promise<void> {
    const sourceText = content.trim();
    if (!sourceText) {
      window.alert('没有可生成待办的内容');
      return;
    }

    let tasks = useAi ? [] : this.parseTodoCandidates(sourceText);
    if (useAi || tasks.length === 0) {
      await aiService.reloadConfig().catch(() => undefined);
      if (!aiService.isConfigured()) {
        window.alert('请先在设置页配置 AI 模型，并点击“保存配置”。');
        return;
      }
      const raw = await aiService.chat([
        { role: 'system', content: '请从用户提供的内容中提取可执行任务。只输出 JSON 数组，不要解释。每项包含 title、description、priority。priority 只能是 low、medium、high、urgent。' },
        { role: 'user', content: sourceText },
      ], { temperature: 0.2 });
      tasks = this.parseJsonTasks(raw);
    }

    if (tasks.length === 0) {
      window.alert('没有识别到可创建的待办');
      return;
    }

    const preview = tasks.slice(0, 8).map((task, index) => `${index + 1}. ${task.title}`).join('\n');
    if (!window.confirm(`将创建 ${tasks.length} 个待办：\n\n${preview}${tasks.length > 8 ? '\n...' : ''}\n\n确认创建吗？`)) return;

    const created = [];
    for (const task of tasks) {
      const createdTask = await ipcClient.todo.addTask({
        title: task.title.slice(0, 80),
        description: task.description || '',
        priority: task.priority || 'medium',
        categoryId: '',
        dueDate: '',
        subtasks: [],
        reminded: false,
        sourceType: tab ? 'document' : 'ai',
        sourceFilePath: tab?.filePath,
        sourceTitle: tab?.fileName,
      });
      created.push(createdTask);
    }

    window.dispatchEvent(new CustomEvent('nova:todo-data-changed', { detail: { count: created.length } }));
    window.alert(`已创建 ${created.length} 个待办。现在可以到“待办中心”查看。`);
  }

  private parseTodoCandidates(text: string): Array<{ title: string; description: string; priority: 'low' | 'medium' | 'high' | 'urgent' }> {
    return text.split(/\r?\n/)
      .map(line => line.trim().replace(/^[-*]\s+\[[ xX]\]\s*/, '').replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s*/, ''))
      .filter(line => line.length >= 3 && line.length <= 120)
      .slice(0, 12)
      .map(title => ({ title, description: '', priority: 'medium' }));
  }

  private parseJsonTasks(raw: string): Array<{ title: string; description: string; priority: 'low' | 'medium' | 'high' | 'urgent' }> {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) return this.parseTodoCandidates(raw);
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item) => ({
        title: String(item.title || '').trim(),
        description: String(item.description || '').trim(),
        priority: ['low', 'medium', 'high', 'urgent'].includes(item.priority) ? item.priority : 'medium',
      })).filter(item => item.title).slice(0, 20);
    } catch {
      return this.parseTodoCandidates(raw);
    }
  }

  private getCurrentTheme(): string {
    return document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'custom-dark'
      : 'custom-light';
  }


  getActiveFileSnapshot(): { filePath: string; fileName: string; content: string; selection?: string } | null {
    if (!this.activeEditorPath) return null;
    const tab = this.editors.get(this.activeEditorPath);
    if (!tab) return null;
    const selection = this.editor?.getSelection();
    const selected = selection ? tab.model.getValueInRange(selection) : '';
    return { filePath: tab.filePath, fileName: tab.fileName, content: tab.model.getValue(), selection: selected || undefined };
  }

  async openPath(filePath: string): Promise<void> {
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    await this.openFile(filePath, fileName);
    this.pinTab(filePath);
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

      const monaco = this.monaco;
      if (!monaco) return;
      const content = await ipcClient.fs.readFile(filePath);
      const language = this.detectLanguage(fileName);
      const model = monaco.editor.createModel(content, language);

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
          this.scheduleMarkdownPreviewUpdate();
        });

        // Update active states
        this.tabElements.forEach((el, key) => {
          el.classList.toggle('active', key === filePath);
        });

        this.updateStatusBar();
        this.updateMarkdownChrome();
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
        this.scheduleMarkdownPreviewUpdate();
      });

      this.updateStatusBar();
      this.updateMarkdownChrome();
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

    const getCurrentPath = () => tab.dataset.path || filePath;

    // Single-click to switch
    tab.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.tab-close')) return;
      this.switchToTab(getCurrentPath());
    });

    // Double-click to pin
    tab.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('.tab-close')) return;
      this.pinTab(getCurrentPath());
    });

    // Close button
    tab.querySelector('.tab-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(getCurrentPath());
    });

    // Middle-click to close
    tab.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        this.closeTab(getCurrentPath());
      }
    });

    // Right-click context menu
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showTabContextMenu(e, getCurrentPath());
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

  private getDirtyOpenTabs(paths = Array.from(this.editors.keys())): string[] {
    return paths.filter((p) => Boolean(this.store?.isDirty(p)));
  }

  private confirmCloseDirtyTabs(paths: string[]): boolean {
    const dirty = this.getDirtyOpenTabs(paths);
    if (dirty.length === 0) return true;
    const names = dirty.slice(0, 5).map((p) => p.split(/[/\\]/).pop() || p).join('、');
    const more = dirty.length > 5 ? ` 等 ${dirty.length} 个文件` : '';
    return window.confirm(`有未保存的更改：${names}${more}。确定关闭并丢弃这些更改吗？`);
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
      { label: '\u5173\u95ED', action: () => { void this.closeTab(filePath); } },
      { label: '\u5173\u95ED\u5176\u4ED6', action: () => { void this.closeOtherTabs(filePath); } },
      { label: '\u5173\u95ED\u6240\u6709', action: () => { void this.closeAllTabs(); } },
      { label: '\u5173\u95ED\u5DF2\u4FDD\u5B58', action: () => { void this.closeSavedTabs(); } },
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

  private async closeOtherTabs(keepPath: string): Promise<void> {
    const paths = Array.from(this.editors.keys()).filter(p => p !== keepPath);
    if (!this.confirmCloseDirtyTabs(paths)) return;
    for (const p of paths) await this.closeTab(p, { force: true });
  }

  private async closeAllTabs(): Promise<void> {
    const paths = Array.from(this.editors.keys());
    if (!this.confirmCloseDirtyTabs(paths)) return;
    for (const p of paths) await this.closeTab(p, { force: true });
  }

  private async closeSavedTabs(): Promise<void> {
    const paths = Array.from(this.editors.keys()).filter(p => !this.store?.isDirty(p));
    for (const p of paths) await this.closeTab(p, { force: true });
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
    this.updateMarkdownChrome();
    setTimeout(() => this.editor?.layout(), 50);
  }

  async closeTab(filePath: string, options?: { force?: boolean }): Promise<void> {
    const tab = this.editors.get(filePath);
    if (!tab) {
      this.removeTabElement(filePath);
      return;
    }

    if (!options?.force && this.store?.isDirty(filePath)) {
      if (!this.confirmCloseDirtyTabs([filePath])) return;
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

  resetForWorkspace(): void {
    this.removeTabContextMenu();
    if (this.markdownPreviewTimer) {
      clearTimeout(this.markdownPreviewTimer);
      this.markdownPreviewTimer = null;
    }

    for (const tab of this.editors.values()) {
      try {
        tab.model.dispose();
      } catch (error) {
        console.warn('[EditorManager] model dispose failed during workspace reset:', error);
      }
    }

    this.editors.clear();
    this.tabElements.clear();
    this.tabsList.innerHTML = '';
    this.activeEditorPath = null;
    this.previewPath = null;
    this.markdownMode = 'edit';
    this.markdownAiBusy = false;

    if (this.editor) {
      this.editor.setModel(null);
      this.updateMarkdownChrome();
      setTimeout(() => this.editor?.layout(), 50);
    }
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
    this.updateMarkdownChrome();
  }

  closeTabsForDeletedPaths(deletedPaths: string[]): void {
    for (const filePath of deletedPaths) {
      this.closeTab(filePath, { force: true });
    }
  }

  async revealActiveFile(): Promise<void> {
    if (!this.activeEditorPath) return;
    const fileTree = (window as any).__fileTree;
    await fileTree?.revealPath?.(this.activeEditorPath);
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
    this.scheduleMarkdownPreviewUpdate();
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