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
import { showInputPrompt, showConfirmDialog, showTaskConfirmDialog } from '../../components/modal';
import { switchPage } from '../../app/router';
import { getCurrentWorkspaceRoot, getRelativePath } from '../../services/workspace-context';
import { exportMarkdownDocument, type ExportFormat } from '../../services/export-service';


interface MonacoEditor {
  create(container: HTMLElement, options: Record<string, unknown>): MonacoEditorInstance;
  createModel(value: string, language: string): MonacoModel;
  defineTheme(name: string, config: Record<string, unknown>): void;
}

interface MonacoEditorInstance {
  setModel(model: MonacoModel | null): void;
  getModel(): MonacoModel | null;
  layout(): void;
  focus(): void;
  updateOptions(options: Record<string, unknown>): void;
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
  private todoCreationBusy = false;
  private autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private lastSavedAt = new Map<string, number>();
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
        '<div class="markdown-version-group">' +
          '<button class="markdown-tool-btn" data-md-action="saveversion">保存版本</button>' +
          '<button class="markdown-tool-btn" data-md-action="history">版本历史</button>' +
        '</div>' +
        '<div class="markdown-export-group">' +
          '<button class="markdown-tool-btn" data-md-action="exporthtml">导出 HTML</button>' +
          '<button class="markdown-tool-btn" data-md-action="exportpdf">导出 PDF</button>' +
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
      readOnly: false,
      domReadOnly: false,
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
    this.restoreEditorInteractivity();
  }

  private restoreEditorInteractivity(options: { focus?: boolean } = {}): void {
    if (!this.editor) return;
    try {
      this.editor.updateOptions({ readOnly: false, domReadOnly: false });
    } catch (error) {
      console.warn('[EditorManager] restore editor options failed:', error);
    }

    if (this.editorHost && this.markdownMode !== 'preview') {
      this.editorHost.hidden = false;
      this.editorHost.style.pointerEvents = '';
    }

    const workspace = this.container.querySelector('.markdown-workspace') as HTMLElement | null;
    if (workspace) {
      workspace.style.pointerEvents = '';
    }

    setTimeout(() => {
      this.editor?.layout();
      if (options.focus && this.markdownMode !== 'preview') {
        try { this.editor?.focus(); } catch {}
      }
    }, 50);
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

  async runMarkdownCommand(action: string): Promise<void> {
    const labelMap: Record<string, string> = {
      summary: 'AI 总结',
      outline: '生成大纲',
      rewrite: '改写选中',
      askdoc: '问当前文档',
      todo: '生成待办',
      saveversion: '保存版本',
      history: '版本历史',
      exporthtml: '导出 HTML',
      exportpdf: '导出 PDF',
    };
    const button = document.createElement('button');
    button.textContent = labelMap[action] || action;
    await this.runMarkdownAiAction(action, button as HTMLButtonElement);
  }

  async exportCurrentMarkdown(format: ExportFormat): Promise<void> {
    if (!this.activeEditorPath) {
      window.alert('请先打开一个 Markdown 文档');
      return;
    }
    const tab = this.editors.get(this.activeEditorPath);
    if (!tab || !isMarkdownFile(tab.fileName)) {
      window.alert('当前文件不是 Markdown 文档');
      return;
    }
    await this.exportActiveMarkdown(tab, format);
  }

  private async exportActiveMarkdown(tab: EditorTab, format: ExportFormat): Promise<void> {
    const previousMode = this.markdownMode;
    try {
      await this.saveFilePath(tab.filePath, 'manual').catch(() => undefined);
      const filePath = await exportMarkdownDocument(format, {
        title: tab.fileName.replace(/\.[^.]+$/, ''),
        fileName: tab.fileName,
        markdown: tab.model.getValue(),
      });
      if (filePath) {
        this.updateSaveStatus(format === 'pdf' ? 'PDF 已导出' : format === 'html' ? 'HTML 已导出' : 'Markdown 已导出');
      }
    } catch (error) {
      window.alert('导出失败：' + (error instanceof Error ? error.message : String(error)));
    } finally {
      // 导出会打开系统保存弹窗和隐藏打印窗口。结束后主动恢复 Monaco 的编辑能力，
      // 避免焦点、hidden 状态或只读状态异常导致“编辑失效”。
      this.markdownMode = previousMode === 'preview' ? 'edit' : previousMode;
      this.applyMarkdownMode();
      this.restoreEditorInteractivity({ focus: true });
    }
  }

  private async runMarkdownAiAction(action: string, button: HTMLButtonElement): Promise<void> {
    if (this.markdownAiBusy) return;
    if (!this.activeEditorPath) return;

    const tab = this.editors.get(this.activeEditorPath);
    if (!tab) return;

    if (action === 'saveversion') {
      await this.createVersionBackup(tab, '手动保存版本', { notify: true });
      return;
    }
    if (action === 'history') {
      await this.showVersionHistory(tab);
      return;
    }
    if (action === 'exporthtml') {
      await this.exportActiveMarkdown(tab, 'html');
      return;
    }
    if (action === 'exportpdf') {
      await this.exportActiveMarkdown(tab, 'pdf');
      return;
    }

    await aiService.reloadConfig().catch(() => undefined);
    if (!aiService.isConfigured()) {
      await this.showAiConfigGuide();
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
      window.alert('AI 操作失败：' + this.toFriendlyAiError(error));
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

    await this.createVersionBackup(tab, 'AI 改写前自动备份');
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
    if (insertBtn) insertBtn.onclick = async () => {
      const current = tab || (this.activeEditorPath ? this.editors.get(this.activeEditorPath) : undefined);
      if (!current || !this.editor) return;
      insertBtn.disabled = true;
      const oldText = insertBtn.textContent || '插入到当前文档';
      try {
        await this.createVersionBackup(current, 'AI 插入前自动备份');
        const position = this.editor.getPosition();
        const line = position?.lineNumber || current.model.getFullModelRange().endLineNumber;
        const column = position?.column || 1;
        current.model.pushEditOperations([], [{ range: { startLineNumber: line, startColumn: column, endLineNumber: line, endColumn: column }, text: '\n\n' + getText() + '\n' }], () => null);
        this.pinTab(current.filePath);
        this.store?.markDirty(current.filePath);
        this.scheduleMarkdownPreviewUpdate();
        insertBtn.textContent = '已插入';
      } catch (error) {
        window.alert('插入失败：' + (error instanceof Error ? error.message : String(error)));
      } finally {
        setTimeout(() => { insertBtn.disabled = false; insertBtn.textContent = oldText; }, 900);
      }
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
    if (this.todoCreationBusy) {
      window.alert('正在生成或创建待办，请稍后。');
      return;
    }

    const sourceText = content.trim();
    if (!sourceText) {
      window.alert('没有可生成待办的内容');
      return;
    }

    this.todoCreationBusy = true;
    let modalTodoButton: HTMLButtonElement | null = document.querySelector('.markdown-ai-todo-btn');
    const originalTodoText = modalTodoButton?.textContent || '生成待办';
    if (modalTodoButton) {
      modalTodoButton.disabled = true;
      modalTodoButton.textContent = useAi ? 'AI 提取中...' : '处理中...';
    }

    try {
      let tasks = useAi ? [] : this.parseTodoCandidates(sourceText);
      if (useAi || tasks.length === 0) {
        await aiService.reloadConfig().catch(() => undefined);
        if (!aiService.isConfigured()) {
          await this.showAiConfigGuide();
          return;
        }
        const raw = await aiService.chat([
          { role: 'system', content: '请从用户提供的内容中提取可执行任务。只输出 JSON 数组，不要解释。每项包含 title、description、priority。priority 只能是 low、medium、high、urgent。' },
          { role: 'user', content: sourceText },
        ], { temperature: 0.2, timeout: 60000 });
        tasks = this.parseJsonTasks(raw);
      }

      tasks = this.dedupeTasks(tasks);
      if (tasks.length === 0) {
        window.alert('没有识别到可创建的待办');
        return;
      }

      const confirmed = await showTaskConfirmDialog(tasks);
      if (!confirmed) return;

      if (modalTodoButton) modalTodoButton.textContent = '创建中...';
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
          sourceRelativePath: getRelativePath(getCurrentWorkspaceRoot(), tab?.filePath),
          sourceTitle: tab?.fileName,
        });
        created.push(createdTask);
      }

      window.dispatchEvent(new CustomEvent('nova:todo-data-changed', { detail: { count: created.length } }));
      const goTodo = await showConfirmDialog({
        title: '待办创建成功',
        message: `已创建 ${created.length} 个待办。是否现在去待办中心查看？`,
        confirmText: '去待办中心',
        cancelText: '留在当前页',
      });
      if (goTodo) switchPage('todo');
    } catch (error) {
      console.error('[EditorManager] Create todos failed:', error);
      window.alert('创建待办失败：' + this.toFriendlyAiError(error));
    } finally {
      this.todoCreationBusy = false;
      modalTodoButton = document.querySelector('.markdown-ai-todo-btn');
      if (modalTodoButton) {
        modalTodoButton.disabled = false;
        modalTodoButton.textContent = originalTodoText;
      }
    }
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

  private dedupeTasks(tasks: Array<{ title: string; description: string; priority: 'low' | 'medium' | 'high' | 'urgent' }>): Array<{ title: string; description: string; priority: 'low' | 'medium' | 'high' | 'urgent' }> {
    const seen = new Set<string>();
    const result = [] as Array<{ title: string; description: string; priority: 'low' | 'medium' | 'high' | 'urgent' }>;
    for (const task of tasks) {
      const title = task.title.trim();
      const key = title.replace(/\s+/g, '').toLowerCase();
      if (!title || seen.has(key)) continue;
      seen.add(key);
      result.push({ ...task, title });
    }
    return result.slice(0, 20);
  }

  private async showAiConfigGuide(): Promise<void> {
    const goSettings = await showConfirmDialog({
      title: '需要配置 AI 模型',
      message: '当前没有可用的 AI 配置。请先到设置页填写 Base URL、API Key 和默认模型，并保存配置。',
      confirmText: '去设置',
      cancelText: '稍后',
    });
    if (goSettings) switchPage('settings');
  }

  private toFriendlyAiError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout|超时|AbortError/i.test(message)) return '请求超时了。国产模型或中转服务可能响应较慢，请稍后重试，或检查 Base URL / 模型名是否正确。';
    if (/401|unauthorized|api key|apikey|密钥|鉴权/i.test(message)) return 'API Key 可能不正确或没有权限，请到设置页重新保存。';
    if (/404|model|模型/i.test(message)) return '模型名称可能不存在，请检查设置页的默认模型。';
    if (/network|fetch failed|ENOTFOUND|ECONNREFUSED|Failed to fetch/i.test(message)) return '网络连接失败，请检查 Base URL 是否可访问。';
    if (/余额|quota|insufficient|credit/i.test(message)) return '账号额度可能不足，请检查服务商余额或套餐。';
    return message || '未知错误，请检查 AI 配置。';
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

        // Content change: auto-pin on edit and auto-save
        model.onDidChangeContent(() => this.handleModelContentChange(filePath));

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

      // Content change: auto-pin on edit and auto-save
      model.onDidChangeContent(() => this.handleModelContentChange(filePath));

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
    this.autoSaveTimers.forEach((timer) => clearTimeout(timer));
    this.autoSaveTimers.clear();

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
    await this.saveFilePath(this.activeEditorPath, 'manual');
  }


  private handleModelContentChange(filePath: string): void {
    const tab = this.editors.get(filePath);
    if (tab?.isPreview) {
      this.pinTab(filePath);
    }
    const tabEl = this.tabElements.get(filePath);
    tabEl?.classList.add('modified');
    this.store?.markDirty(filePath);
    this.updateSaveStatus('待自动保存...');
    this.scheduleAutoSave(filePath);
    this.scheduleMarkdownPreviewUpdate();
  }

  private scheduleAutoSave(filePath: string): void {
    const existing = this.autoSaveTimers.get(filePath);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.autoSaveTimers.delete(filePath);
      void this.saveFilePath(filePath, 'auto').catch((error) => {
        console.warn('[EditorManager] Auto-save failed:', error);
        this.updateSaveStatus('自动保存失败');
      });
    }, 1600);
    this.autoSaveTimers.set(filePath, timer);
  }

  private async saveFilePath(filePath: string, mode: 'auto' | 'manual' = 'manual'): Promise<void> {
    const tab = this.editors.get(filePath);
    if (!tab) return;
    const timer = this.autoSaveTimers.get(filePath);
    if (timer) {
      clearTimeout(timer);
      this.autoSaveTimers.delete(filePath);
    }
    this.updateSaveStatus(mode === 'auto' ? '自动保存中...' : '保存中...');
    await ipcClient.fs.writeFile(filePath, tab.model.getValue());
    const tabEl = this.tabElements.get(filePath);
    tabEl?.classList.remove('modified');
    this.store?.clearDirty(filePath);
    this.lastSavedAt.set(filePath, Date.now());
    this.updateStatusBar();
    this.updateSaveStatus(mode === 'auto' ? '已自动保存' : '已保存');
    this.scheduleMarkdownPreviewUpdate();
  }

  private async createVersionBackup(tab: EditorTab, reason: string, options: { notify?: boolean } = {}): Promise<boolean> {
    const workspaceRoot = this.store?.getWorkspaceRoot();
    if (!workspaceRoot) {
      if (options.notify) window.alert('请先打开一个工作区，再保存版本。');
      return false;
    }
    try {
      await ipcClient.fs.createBackup({
        workspaceRoot,
        filePath: tab.filePath,
        content: tab.model.getValue(),
        reason,
      });
      if (options.notify) this.updateSaveStatus('版本已保存');
      return true;
    } catch (error) {
      console.warn('[EditorManager] Create version backup failed:', error);
      if (options.notify) window.alert('保存版本失败：' + (error instanceof Error ? error.message : String(error)));
      return false;
    }
  }

  private async showVersionHistory(tab: EditorTab): Promise<void> {
    const workspaceRoot = this.store?.getWorkspaceRoot();
    if (!workspaceRoot) {
      window.alert('请先打开一个工作区。');
      return;
    }
    let backups;
    try {
      backups = await ipcClient.fs.listBackups({ workspaceRoot, filePath: tab.filePath });
    } catch (error) {
      window.alert('读取版本历史失败：' + (error instanceof Error ? error.message : String(error)));
      return;
    }

    let modal = document.querySelector('.version-history-modal') as HTMLElement | null;
    modal?.remove();
    modal = document.createElement('div');
    modal.className = 'version-history-modal markdown-ai-modal show';
    const rows = backups.length ? backups.map((item) => {
      const time = new Date(item.createdAt).toLocaleString();
      const size = item.size < 1024 ? `${item.size} B` : `${(item.size / 1024).toFixed(1)} KB`;
      return '<div class="version-history-item" data-backup-path="' + this.escAttr(item.backupPath) + '">' +
        '<div class="version-history-main"><strong>' + this.escHTML(item.reason || '历史版本') + '</strong><span>' + this.escHTML(time) + ' · ' + this.escHTML(size) + '</span></div>' +
        '<div class="version-history-actions"><button class="version-history-preview">预览</button><button class="version-history-restore">恢复</button><button class="version-history-delete">删除</button></div>' +
      '</div>';
    }).join('') : '<div class="version-history-empty">还没有历史版本。点击“保存版本”，或使用 AI 插入/改写后会自动创建备份。</div>';

    modal.innerHTML =
      '<div class="markdown-ai-modal-card version-history-card">' +
        '<div class="markdown-ai-modal-header"><h3>版本历史 · ' + this.escHTML(tab.fileName) + '</h3><button class="markdown-ai-modal-close" title="关闭">×</button></div>' +
        '<div class="version-history-list">' + rows + '</div>' +
        '<div class="markdown-ai-modal-actions"><button class="markdown-ai-copy-btn version-history-save-current">保存当前版本</button></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.querySelector('.markdown-ai-modal-close')?.addEventListener('click', () => modal?.remove());
    modal.addEventListener('click', (event) => { if (event.target === modal) modal?.remove(); });

    modal.querySelector('.version-history-save-current')?.addEventListener('click', async () => {
      await this.createVersionBackup(tab, '手动保存版本', { notify: true });
      modal?.remove();
      await this.showVersionHistory(tab);
    });


    modal.querySelectorAll('.version-history-preview').forEach((button) => {
      button.addEventListener('click', async () => {
        const item = (button as HTMLElement).closest('.version-history-item') as HTMLElement | null;
        const backupPath = item?.dataset.backupPath;
        if (!backupPath) return;
        try {
          const backup = await ipcClient.fs.readBackup({ workspaceRoot, backupPath });
          this.showVersionPreview(tab, backup.content);
        } catch (error) {
          window.alert('预览失败：' + (error instanceof Error ? error.message : String(error)));
        }
      });
    });

    modal.querySelectorAll('.version-history-delete').forEach((button) => {
      button.addEventListener('click', async () => {
        const item = (button as HTMLElement).closest('.version-history-item') as HTMLElement | null;
        const backupPath = item?.dataset.backupPath;
        if (!backupPath) return;
        const title = item?.querySelector('.version-history-main strong')?.textContent || '这个历史版本';
        const ok = await showConfirmDialog({
          title: '删除历史版本',
          message: `确定要删除「${title}」吗？删除后不能恢复。只是想查看内容请点“预览”。`,
          confirmText: '删除',
          cancelText: '取消',
          danger: true,
        });
        if (!ok) return;
        try {
          await ipcClient.fs.deleteBackup({ workspaceRoot, backupPath });
          item?.remove();
          this.updateSaveStatus('已删除历史版本');
          if (!modal?.querySelector('.version-history-item')) {
            const list = modal?.querySelector('.version-history-list');
            if (list) list.innerHTML = '<div class="version-history-empty">还没有历史版本。点击“保存版本”，或使用 AI 插入/改写后会自动创建备份。</div>';
          }
        } catch (error) {
          window.alert('删除失败：' + (error instanceof Error ? error.message : String(error)));
        }
      });
    });


    modal.querySelectorAll('.version-history-restore').forEach((button) => {
      button.addEventListener('click', async () => {
        const item = (button as HTMLElement).closest('.version-history-item') as HTMLElement | null;
        const backupPath = item?.dataset.backupPath;
        if (!backupPath) return;
        const ok = await showConfirmDialog({
          title: '恢复历史版本',
          message: '恢复会覆盖当前文档内容。只是查看请点击“预览”，预览不会创建备份。确认恢复时，Nova 会先为当前内容保存一个“恢复前自动备份”。是否继续？',
          confirmText: '恢复版本',
          cancelText: '取消',
          danger: true,
        });
        if (!ok) return;
        await this.createVersionBackup(tab, '恢复前自动备份');
        try {
          const restored = await ipcClient.fs.restoreBackup({ workspaceRoot, filePath: tab.filePath, backupPath });
          tab.model.setValue(restored.content);
          const tabEl = this.tabElements.get(tab.filePath);
          tabEl?.classList.remove('modified');
          this.store?.clearDirty(tab.filePath);
          this.updateSaveStatus('已恢复历史版本');
          this.scheduleMarkdownPreviewUpdate();
          modal?.remove();
        } catch (error) {
          window.alert('恢复失败：' + (error instanceof Error ? error.message : String(error)));
        }
      });
    });
  }


  private showVersionPreview(tab: EditorTab, historicalContent: string): void {
    let modal = document.querySelector('.version-preview-modal') as HTMLElement | null;
    modal?.remove();
    modal = document.createElement('div');
    modal.className = 'version-preview-modal markdown-ai-modal show';
    const currentContent = tab.model.getValue();
    modal.innerHTML =
      '<div class="markdown-ai-modal-card version-preview-card">' +
        '<div class="markdown-ai-modal-header"><h3>预览历史版本 · ' + this.escHTML(tab.fileName) + '</h3><button class="markdown-ai-modal-close" title="关闭">×</button></div>' +
        '<div class="version-preview-tip">这里只是查看历史内容，不会创建新备份，也不会修改当前文档。需要回退时，请关闭预览后点击“恢复”。</div>' +
        '<div class="version-preview-grid">' +
          '<section><h4>当前内容</h4><pre>' + this.escHTML(currentContent || '（空）') + '</pre></section>' +
          '<section><h4>历史内容</h4><pre>' + this.escHTML(historicalContent || '（空）') + '</pre></section>' +
        '</div>' +
        '<div class="markdown-ai-modal-actions"><button class="markdown-ai-copy-btn version-preview-copy">复制历史内容</button><button class="markdown-ai-insert-btn version-preview-close">关闭预览</button></div>' +
      '</div>';
    document.body.appendChild(modal);
    const close = () => modal?.remove();
    modal.querySelector('.markdown-ai-modal-close')?.addEventListener('click', close);
    modal.querySelector('.version-preview-close')?.addEventListener('click', close);
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
    modal.querySelector('.version-preview-copy')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(historicalContent || '');
      this.updateSaveStatus('历史内容已复制');
    });
  }

  private updateSaveStatus(text: string): void {
    let el = document.getElementById('status-save-state');
    if (!el) {
      const left = document.querySelector('.status-left');
      el = document.createElement('span');
      el.id = 'status-save-state';
      el.className = 'status-item status-save-state';
      left?.appendChild(el);
    }
    el.textContent = text;
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

  private escAttr(str: string): string {
    return this.escHTML(str).replace(/"/g, '&quot;');
  }
}