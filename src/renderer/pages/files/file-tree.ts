/**
 * FileTree - File tree browser component with search
 * Features: distinct file/folder icons, AI analysis integration
 */
import { ipcClient } from '../../services/ipc-client';
import { showInputPrompt } from '../../components/modal';
import type { FileEntry } from '../../../shared/types/file';

export type FileSelectedHandler = (filePath: string, fileName: string) => void;
export type FolderSelectedHandler = (folderPath: string) => void;
export type FileRenamedHandler = (oldPath: string, newPath: string, isDir: boolean) => void;
export type FileDeletedHandler = (itemPath: string, isDir: boolean) => void;

export class FileTree {
  private container: HTMLElement;
  private rootPath: string | null = null;
  private selectedPath: string | null = null;
  private selectedIsDir = false;
  private expandedDirs = new Set<string>();
  private searchTerm = '';
  private searchInput: HTMLInputElement | null = null;

  onFileSelect: FileSelectedHandler | null = null;
  onFolderSelect: FolderSelectedHandler | null = null;
  onFileRenamed: FileRenamedHandler | null = null;
  onFileDeleted: FileDeletedHandler | null = null;

  constructor(containerEl: HTMLElement) {
    this.container = containerEl;
    this.initSearch();
  }

  private initSearch(): void {
    const parent = this.container.parentElement;
    if (!parent) return;

    const searchDiv = document.createElement('div');
    searchDiv.className = 'file-search-bar';
    searchDiv.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>' +
      '<input type="text" placeholder="\u641C\u7D22\u6587\u4EF6..." class="file-search-input" />';
    parent.insertBefore(searchDiv, this.container);

    this.searchInput = searchDiv.querySelector('.file-search-input') as HTMLInputElement;
    this.searchInput?.addEventListener('input', (e) => {
      this.searchTerm = (e.target as HTMLInputElement).value.trim().toLowerCase();
      this.render();
    });
    this.searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.searchInput!.value = '';
        this.searchTerm = '';
        this.render();
      }
    });
  }

  getWorkspaceRoot(): string | null {
    return this.rootPath;
  }

  getSelectedPath(): string | null {
    return this.selectedPath;
  }

  getSelectedFolderPath(): string | null {
    if (!this.selectedPath) return this.rootPath ?? null;
    if (this.selectedIsDir) return this.selectedPath;
    return (this.dirname(this.selectedPath) || this.rootPath) ?? null;
  }

  getCreateTargetDir(): string | null {
    return this.getSelectedFolderPath();
  }

  async openFolder(): Promise<void> {
    const result = await ipcClient.fs.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths.length) return;
    const root = result.filePaths[0];
    this.rootPath = root;
    this.selectedPath = null;
    this.selectedIsDir = false;
    this.expandedDirs.clear();
    this.expandedDirs.add(root);
    this.onFolderSelect?.(root);

    try {
      const name = root.split(/[/\\]/).pop() || root;
      await ipcClient.workspace.open({ rootPath: root, name });
      await ipcClient.recent.add({ name, path: root, lastOpened: new Date().toISOString() });
    } catch (err) {
      console.warn('[FileTree] Failed to record workspace:', err);
    }

    await this.render();
  }

  async openProjectPath(projectPath: string, options: { recordWorkspace?: boolean } = {}): Promise<void> {
    this.rootPath = projectPath;
    this.selectedPath = null;
    this.selectedIsDir = false;
    this.expandedDirs.clear();
    this.expandedDirs.add(projectPath);

    if (options.recordWorkspace !== false) {
      try {
        const name = projectPath.split(/[/\\]/).pop() || projectPath;
        await ipcClient.workspace.open({ rootPath: projectPath, name });
      } catch (err) {
        console.warn('[FileTree] Failed to record workspace:', err);
      }
    }

    this.onFolderSelect?.(projectPath);
    await this.render();
  }

  async render(): Promise<void> {
    if (!this.rootPath) {
      this.container.innerHTML =
        '<div class="empty-state">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
        '<p>\u6253\u5F00\u6587\u4EF6\u5939\u5F00\u59CB\u4F7F\u7528</p>' +
        '</div>';
      return;
    }
    this.container.innerHTML = '';
    await this.renderDir(this.rootPath, this.container, 0);
  }

  private async renderDir(dirPath: string, parentEl: HTMLElement, depth: number): Promise<void> {
    let entries: FileEntry[];
    try {
      entries = await ipcClient.fs.readDirectory(dirPath);
    } catch {
      return;
    }
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (this.searchTerm && !entry.name.toLowerCase().includes(this.searchTerm)) {
        if (!entry.isDirectory) continue;
      }

      const fullPath = dirPath + (dirPath.endsWith('\\') || dirPath.endsWith('/') ? '' : '\\') + entry.name;
      const isExpanded = this.expandedDirs.has(fullPath);
      const isSelected = this.selectedPath === fullPath;

      const item = document.createElement('div');
      item.className = 'tree-item' + (isSelected ? ' selected' : '');
      item.dataset.path = fullPath;
      item.dataset.type = entry.isDirectory ? 'dir' : 'file';
      item.title = fullPath;
      item.style.paddingLeft = (12 + depth * 16) + 'px';

      if (entry.isDirectory) {
        const arrowSvg = '<span class="tree-item-arrow' + (isExpanded ? ' expanded' : '') + '">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
          '</span>';
        const folderIcon = isExpanded
          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" opacity="0.7"><path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z"/></svg>'
          : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.6"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';

        item.innerHTML = arrowSvg + '<span class="tree-item-icon">' + folderIcon + '</span><span class="tree-item-name">' + this.esc(entry.name) + '</span>';

        item.addEventListener('click', () => this.toggleDir(fullPath));
        item.addEventListener('contextmenu', (e) => { e.preventDefault(); this.showContextMenu(e, fullPath, entry.name, true); });

        parentEl.appendChild(item);

        if (isExpanded) {
          const childContainer = document.createElement('div');
          childContainer.className = 'tree-children';
          parentEl.appendChild(childContainer);
          await this.renderDir(fullPath, childContainer, depth + 1);
        }
      } else {
        const fileIcon = this.getFileIcon(entry.name);
        item.innerHTML = '<span class="tree-item-icon">' + fileIcon + '</span><span class="tree-item-name">' + this.esc(entry.name) + '</span>';

        item.addEventListener('click', () => this.selectFile(fullPath, entry.name, item));
        item.addEventListener('contextmenu', (e) => { e.preventDefault(); this.showContextMenu(e, fullPath, entry.name, false); });

        parentEl.appendChild(item);
      }
    }
  }

  private getFileIcon(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const iconMap: Record<string, string> = {
      ts: '#3178c6', tsx: '#3178c6',
      js: '#f7df1e', jsx: '#61dafb',
      json: '#fbbf24', md: '#60a5fa',
      html: '#f97316', css: '#8b5cf6',
      py: '#34d399', rs: '#fb923c',
      go: '#60a5fa', java: '#ef4444',
      c: '#6b7280', cpp: '#6b7280',
      yml: '#f472b6', yaml: '#f472b6',
      xml: '#a78bfa', txt: '#9ca3af',
      sh: '#34d399', bat: '#6b7280',
      vue: '#34d399', svelte: '#f97316',
      png: '#f472b6', jpg: '#f472b6', gif: '#f472b6', svg: '#fbbf24',
      pdf: '#ef4444', doc: '#3178c6', docx: '#3178c6',
    };

    const color = iconMap[ext];
    if (color) {
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" opacity="0.8"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>';
    }

    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>';
  }

  private async toggleDir(dirPath: string): Promise<void> {
    if (this.expandedDirs.has(dirPath)) {
      this.expandedDirs.delete(dirPath);
    } else {
      this.expandedDirs.add(dirPath);
    }
    this.selectedPath = dirPath;
    this.selectedIsDir = true;
    this.onFolderSelect?.(dirPath);
    await this.render();
  }

  private selectFile(filePath: string, fileName: string, itemEl: HTMLElement): void {
    this.container.querySelectorAll('.tree-item.selected').forEach((el) => el.classList.remove('selected'));
    itemEl.classList.add('selected');
    this.selectedPath = filePath;
    this.selectedIsDir = false;
    this.onFileSelect?.(filePath, fileName);
  }

  private selectFolder(folderPath: string, itemEl: HTMLElement): void {
    this.container.querySelectorAll('.tree-item.selected').forEach((el) => el.classList.remove('selected'));
    itemEl.classList.add('selected');
    this.selectedPath = folderPath;
    this.selectedIsDir = true;
    this.onFolderSelect?.(folderPath);
  }

  private showContextMenu(e: MouseEvent, itemPath: string, itemName: string, isDir: boolean): void {
    this.removeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'tree-context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    if (isDir) {
      menu.appendChild(this.createContextItem('\u65B0\u5EFA\u6587\u4EF6', () => this.handleContextNewFile(itemPath)));
      menu.appendChild(this.createContextItem('\u65B0\u5EFA\u6587\u4EF6\u5939', () => this.handleContextNewFolder(itemPath)));
    }
    menu.appendChild(this.createContextItem('\u590D\u5236\u8DEF\u5F84', () => this.handleCopyPath(itemPath)));
    if (!isDir) {
      menu.appendChild(this.createContextItem('\u6253\u5F00', () => this.onFileSelect?.(itemPath, itemName)));
      menu.appendChild(this.createContextItem('AI \u5206\u6790', () => this.handleAIAnalysis(itemPath)));
    }
    menu.appendChild(this.createContextItem('\u91CD\u547D\u540D', () => this.renameItem(itemPath, itemName, isDir)));
    menu.appendChild(this.createContextItem('\u5220\u9664', () => this.deleteItem(itemPath, itemName, isDir), true));

    document.body.appendChild(menu);
    setTimeout(() => {
      document.addEventListener('click', this._closeContextMenu = () => this.removeContextMenu(), { once: true });
    }, 0);
  }

  private createContextItem(label: string, handler?: (() => void) | null, danger?: boolean): HTMLElement {
    const el = document.createElement('div');
    el.className = 'tree-context-item' + (danger ? ' danger' : '');
    el.textContent = label;
    if (handler) el.addEventListener('click', () => { this.removeContextMenu(); handler(); });
    return el;
  }

  private _closeContextMenu: (() => void) | null = null;

  private removeContextMenu(): void {
    document.querySelectorAll('.tree-context-menu').forEach((el) => el.remove());
  }

  private async handleCopyPath(itemPath: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(itemPath);
    } catch (error) {
      console.warn('[FileTree] copy path failed:', error);
    }
  }

  private async handleAIAnalysis(filePath: string): Promise<void> {
    try {
      const content = await ipcClient.fs.readFile(filePath);
      const { switchPage } = await import('../../app/router');
      await switchPage('ai');
      const aiInput = document.getElementById('ai-chat-input') as HTMLTextAreaElement;
      if (aiInput) {
        aiInput.value = '\u8BF7\u5206\u6790\u4EE5\u4E0B\u6587\u4EF6\u5185\u5BB9\uFF1A\n\n```\n' + content.slice(0, 3000) + '\n```';
        const sendBtn = document.getElementById('btn-ai-send');
        sendBtn?.click();
      }
    } catch (err) {
      console.error('[FileTree] AI analysis failed:', err);
    }
  }

  private async handleContextNewFile(dirPath: string): Promise<void> {
    const name = await showInputPrompt('\u65B0\u5EFA\u6587\u4EF6', '\u8F93\u5165\u6587\u4EF6\u540D');
    if (!name?.trim()) return;
    try {
      const filePath = await ipcClient.fs.createFile(dirPath, name.trim());
      await this.render();
      this.onFileSelect?.(filePath, name.trim());
    } catch (err) {
      alert('\u521B\u5EFA\u6587\u4EF6\u5931\u8D25: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  private async handleContextNewFolder(dirPath: string): Promise<void> {
    const name = await showInputPrompt('\u65B0\u5EFA\u6587\u4EF6\u5939', '\u8F93\u5165\u6587\u4EF6\u5939\u540D');
    if (!name?.trim()) return;
    try {
      await ipcClient.fs.createDirectory(dirPath, name.trim());
      await this.render();
    } catch (err) {
      alert('\u521B\u5EFA\u6587\u4EF6\u5939\u5931\u8D25: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  private async renameItem(itemPath: string, oldName: string, isDir: boolean): Promise<void> {
    const newName = await showInputPrompt('\u91CD\u547D\u540D', '\u8F93\u5165\u65B0\u540D\u79F0', oldName);
    if (!newName?.trim() || newName.trim() === oldName) return;
    try {
      const newPath = await ipcClient.fs.renameItem(itemPath, newName.trim());
      await this.render();
      this.onFileRenamed?.(itemPath, newPath, isDir);
    } catch (err) {
      alert('\u91CD\u547D\u540D\u5931\u8D25: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  private async deleteItem(itemPath: string, itemName: string, isDir: boolean): Promise<void> {
    if (!confirm('\u786E\u5B9A\u8981\u5220\u9664' + (isDir ? '\u6587\u4EF6\u5939' : '\u6587\u4EF6') + ' "' + itemName + '" \u5417\uFF1F')) return;
    try {
      await ipcClient.fs.deleteItem(itemPath);
      await this.render();
      this.onFileDeleted?.(itemPath, isDir);
    } catch (err) {
      alert('\u5220\u9664\u5931\u8D25: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  private dirname(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    const idx = normalized.lastIndexOf('/');
    if (idx <= 0) return '';
    return filePath.slice(0, idx);
  }

  private esc(str: string): string {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  navigateToFolder(folderPath: string): void {
    if (!folderPath) return;
    this.selectedPath = folderPath;
    this.selectedIsDir = true;
    this.expandAncestors(folderPath);
    this.expandedDirs.add(folderPath);
    void this.render().then(() => this.scrollPathIntoView(folderPath));
    this.onFolderSelect?.(folderPath);
  }

  async refresh(): Promise<void> {
    await this.render();
    if (this.selectedPath) this.scrollPathIntoView(this.selectedPath);
  }

  async revealPath(filePath: string): Promise<void> {
    if (!filePath) return;
    this.expandAncestors(filePath);
    this.selectedPath = filePath;
    this.selectedIsDir = false;
    await this.render();
    this.scrollPathIntoView(filePath);
  }

  async listFiles(limit = 1200): Promise<string[]> {
    if (!this.rootPath) return [];
    const results: string[] = [];
    await this.collectFiles(this.rootPath, results, limit);
    return results;
  }

  searchAndHighlight(query: string): void {
    const normalizedQuery = query.trim().toLowerCase();
    const items = this.container.querySelectorAll('.tree-item');
    items.forEach(item => {
      const nameEl = item.querySelector('.tree-item-name');
      const name = nameEl?.textContent?.toLowerCase() || '';
      const matched = !normalizedQuery || name.includes(normalizedQuery);
      (item as HTMLElement).style.display = matched ? '' : 'none';
      item.classList.toggle('search-match', Boolean(normalizedQuery && matched));
    });
  }

  clearSearchHighlight(): void {
    this.container.querySelectorAll('.tree-item').forEach(item => {
      (item as HTMLElement).style.display = '';
      item.classList.remove('search-match');
    });
  }

  private expandAncestors(targetPath: string): void {
    const root = this.rootPath;
    if (!root) return;

    const normalizedRoot = root.replace(/\\/g, '/');
    const normalizedTarget = targetPath.replace(/\\/g, '/');
    if (!normalizedTarget.startsWith(normalizedRoot)) return;

    this.expandedDirs.add(root);
    let current = root;
    const relative = normalizedTarget.slice(normalizedRoot.length).replace(/^\//, '');
    const parts = relative.split('/').filter(Boolean);
    for (let i = 0; i < parts.length - 1; i += 1) {
      current = current + (current.endsWith('\\') || current.endsWith('/') ? '' : '\\') + parts[i];
      this.expandedDirs.add(current);
    }
  }

  private scrollPathIntoView(targetPath: string): void {
    const normalizedTarget = targetPath.replace(/\\/g, '/');
    const items = Array.from(this.container.querySelectorAll('.tree-item')) as HTMLElement[];
    const match = items.find((item) => (item.dataset.path || '').replace(/\\/g, '/') === normalizedTarget);
    if (!match) return;
    this.container.querySelectorAll('.tree-item.selected').forEach((el) => el.classList.remove('selected'));
    match.classList.add('selected');
    match.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  private async collectFiles(dirPath: string, results: string[], limit: number): Promise<void> {
    if (results.length >= limit) return;

    let entries: FileEntry[];
    try {
      entries = await ipcClient.fs.readDirectory(dirPath);
    } catch {
      return;
    }

    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (results.length >= limit) return;
      const fullPath = dirPath + (dirPath.endsWith('\\') || dirPath.endsWith('/') ? '' : '\\') + entry.name;

      if (entry.isDirectory) {
        if (this.shouldSkipDirectory(entry.name)) continue;
        await this.collectFiles(fullPath, results, limit);
        continue;
      }

      results.push(fullPath);
    }
  }

  private shouldSkipDirectory(name: string): boolean {
    return new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.vite', 'coverage']).has(name);
  }

}