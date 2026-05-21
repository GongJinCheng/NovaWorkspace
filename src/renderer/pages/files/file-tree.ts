/**
 * FileTree - File tree browser component
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

  onFileSelect: FileSelectedHandler | null = null;
  onFolderSelect: FolderSelectedHandler | null = null;
  onFileRenamed: FileRenamedHandler | null = null;
  onFileDeleted: FileDeletedHandler | null = null;

  constructor(containerEl: HTMLElement) {
    this.container = containerEl;
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
    await this.render();
  }

  async render(): Promise<void> {
    if (!this.rootPath) {
      this.container.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><p>Open a folder to start</p></div>';
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
      const isExpanded = this.expandedDirs.has(entry.path);
      const isSelected = this.selectedPath === entry.path;
      const item = document.createElement('div');
      item.className = 'tree-item' + (isSelected ? ' selected' : '');
      item.style.paddingLeft = (12 + depth * 16) + 'px';
      if (entry.isDirectory) {
        item.innerHTML = '<span class="tree-item-arrow ' + (isExpanded ? 'expanded' : '') + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span><span class="tree-item-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span><span class="tree-item-name">' + this.esc(entry.name) + '</span>';
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectFolder(entry.path, item);
          this.toggleDir(entry.path);
        });
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.selectFolder(entry.path, item);
          this.showContextMenu(e, entry.path, entry.name, true);
        });
        parentEl.appendChild(item);
        if (isExpanded) await this.renderDir(entry.path, parentEl, depth + 1);
      } else {
        item.innerHTML = '<span class="tree-item-arrow" style="visibility:hidden"><svg width="12" height="12" viewBox="0 0 24 24"></svg></span><span class="tree-item-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg></span><span class="tree-item-name">' + this.esc(entry.name) + '</span>';
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectFile(entry.path, entry.name, item);
        });
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.selectFile(entry.path, entry.name, item);
          this.showContextMenu(e, entry.path, entry.name, false);
        });
        parentEl.appendChild(item);
      }
    }
  }

  private async toggleDir(dirPath: string): Promise<void> {
    if (this.expandedDirs.has(dirPath)) this.expandedDirs.delete(dirPath);
    else this.expandedDirs.add(dirPath);
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
      menu.appendChild(this.createContextItem('New File', () => this.handleContextNewFile(itemPath)));
      menu.appendChild(this.createContextItem('New Folder', () => this.handleContextNewFolder(itemPath)));
    }
    menu.appendChild(this.createContextItem('Copy Path', () => this.handleCopyPath(itemPath)));
    if (!isDir) {
      menu.appendChild(this.createContextItem('Open', () => this.onFileSelect?.(itemPath, itemName)));
    }
    menu.appendChild(this.createContextItem('Rename', () => this.renameItem(itemPath, itemName, isDir)));
    menu.appendChild(this.createContextItem('Delete', () => this.deleteItem(itemPath, itemName, isDir), true));

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

  private async handleContextNewFile(dirPath: string): Promise<void> {
    const name = await showInputPrompt('New File', 'Enter file name');
    if (!name?.trim()) return;
    try {
      const filePath = await ipcClient.fs.createFile(dirPath, name.trim());
      await this.render();
      this.onFileSelect?.(filePath, name.trim());
    } catch (err) {
      alert('Create file failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  private async handleContextNewFolder(dirPath: string): Promise<void> {
    const name = await showInputPrompt('New Folder', 'Enter folder name');
    if (!name?.trim()) return;
    try {
      await ipcClient.fs.createDirectory(dirPath, name.trim());
      await this.render();
    } catch (err) {
      alert('Create folder failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  private async renameItem(itemPath: string, oldName: string, isDir: boolean): Promise<void> {
    const newName = await showInputPrompt('Rename', 'Enter new name', oldName);
    if (!newName?.trim() || newName.trim() === oldName) return;
    try {
      const newPath = await ipcClient.fs.renameItem(itemPath, newName.trim());
      await this.render();
      this.onFileRenamed?.(itemPath, newPath, isDir);
    } catch (err) {
      alert('Rename failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  private async deleteItem(itemPath: string, itemName: string, isDir: boolean): Promise<void> {
    if (!confirm('Delete ' + (isDir ? 'folder' : 'file') + ' "' + itemName + '"?')) return;
    try {
      await ipcClient.fs.deleteItem(itemPath);
      await this.render();
      this.onFileDeleted?.(itemPath, isDir);
    } catch (err) {
      alert('Delete failed: ' + (err instanceof Error ? err.message : String(err)));
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
}