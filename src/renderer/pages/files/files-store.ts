/**
 * Files store - single source of truth for file manager runtime state.
 *
 * Owns:
 * - workspace root / selected folder context
 * - open tabs
 * - active file
 * - dirty flags
 * - state persistence (localStorage)
 */

export type FilesListener = (state: FilesState) => void;

export interface FilesState {
  workspaceRoot: string | null;
  selectedFolderPath: string | null;
  activeFilePath: string | null;
  openTabs: string[];
  dirtySet: string[];
}

const STORAGE_KEY_WORKSPACE = 'files-workspace-root';
const STORAGE_KEY_TABS = 'files-open-tabs';
const STORAGE_KEY_ACTIVE = 'files-active-tab';

export class FilesStore {
  private workspaceRoot: string | null = null;
  private selectedFolderPath: string | null = null;
  private activeFilePath: string | null = null;
  private openTabs: string[] = [];
  private dirtySet = new Set<string>();
  private listeners = new Set<FilesListener>();

  subscribe(listener: FilesListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): FilesState {
    return {
      workspaceRoot: this.workspaceRoot,
      selectedFolderPath: this.selectedFolderPath,
      activeFilePath: this.activeFilePath,
      openTabs: [...this.openTabs],
      dirtySet: [...this.dirtySet],
    };
  }

  getWorkspaceRoot(): string | null {
    return this.workspaceRoot;
  }

  getSelectedFolderPath(): string | null {
    return this.selectedFolderPath;
  }

  getCreateTargetDir(): string | null {
    return this.selectedFolderPath ?? this.workspaceRoot ?? null;
  }

  getActiveFilePath(): string | null {
    return this.activeFilePath;
  }

  isFileOpen(filePath: string): boolean {
    return this.openTabs.includes(filePath);
  }

  isDirty(filePath: string): boolean {
    return this.dirtySet.has(filePath);
  }

  setWorkspaceRoot(root: string | null): void {
    if (this.workspaceRoot === root) return;
    this.workspaceRoot = root;
    this.emit();
  }

  setSelectedFolder(folderPath: string | null): void {
    if (this.selectedFolderPath === folderPath) return;
    this.selectedFolderPath = folderPath;
    this.emit();
  }

  openFile(filePath: string): void {
    if (!this.openTabs.includes(filePath)) {
      this.openTabs = [...this.openTabs, filePath];
    }
    this.activeFilePath = filePath;
    this.emit();
  }

  setActive(filePath: string | null): void {
    if (this.activeFilePath === filePath) return;
    this.activeFilePath = filePath;
    this.emit();
  }

  markDirty(filePath: string): void {
    if (this.dirtySet.has(filePath)) return;
    this.dirtySet.add(filePath);
    this.emit();
  }

  clearDirty(filePath: string): void {
    if (!this.dirtySet.has(filePath)) return;
    this.dirtySet.delete(filePath);
    this.emit();
  }

  renameFile(oldPath: string, newPath: string): void {
    this.openTabs = this.openTabs.map((p) => (p === oldPath ? newPath : p));
    if (this.activeFilePath === oldPath) {
      this.activeFilePath = newPath;
    }
    if (this.dirtySet.has(oldPath)) {
      this.dirtySet.delete(oldPath);
      this.dirtySet.add(newPath);
    }
    if (this.selectedFolderPath === oldPath) {
      this.selectedFolderPath = newPath;
    }
    this.emit();
  }

  closeFile(filePath: string): void {
    this.openTabs = this.openTabs.filter((p) => p !== filePath);
    this.dirtySet.delete(filePath);
    if (this.activeFilePath === filePath) {
      this.activeFilePath = this.openTabs[this.openTabs.length - 1] ?? null;
    }
    this.emit();
  }

  closeFilesUnderDir(dirPath: string): string[] {
    const normalizedDir = dirPath.replace(/\\/g, '/');
    const targets = this.openTabs.filter((filePath) => {
      const normalizedFile = filePath.replace(/\\/g, '/');
      return normalizedFile === normalizedDir || normalizedFile.startsWith(normalizedDir + '/');
    });
    for (const target of targets) {
      this.closeFile(target);
    }
    return targets;
  }

  // --- State Persistence ---

  saveState(): void {
    try {
      if (this.workspaceRoot) {
        localStorage.setItem(STORAGE_KEY_WORKSPACE, this.workspaceRoot);
      }
      localStorage.setItem(STORAGE_KEY_TABS, JSON.stringify(this.openTabs));
      if (this.activeFilePath) {
        localStorage.setItem(STORAGE_KEY_ACTIVE, this.activeFilePath);
      }
    } catch { /* ignore */ }
  }

  static restoreState(): { workspaceRoot: string | null; openTabs: string[]; activeTab: string | null } {
    try {
      return {
        workspaceRoot: localStorage.getItem(STORAGE_KEY_WORKSPACE),
        openTabs: JSON.parse(localStorage.getItem(STORAGE_KEY_TABS) || '[]'),
        activeTab: localStorage.getItem(STORAGE_KEY_ACTIVE),
      };
    } catch {
      return { workspaceRoot: null, openTabs: [], activeTab: null };
    }
  }

  clearState(): void {
    localStorage.removeItem(STORAGE_KEY_WORKSPACE);
    localStorage.removeItem(STORAGE_KEY_TABS);
    localStorage.removeItem(STORAGE_KEY_ACTIVE);
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (error) {
        console.error('[FilesStore] listener failed:', error);
      }
    }
    // Auto-save on every state change
    this.saveState();
  }

  // --- Favorites ---
  private favorites: Set<string> = new Set();

  toggleFavorite(filePath: string): boolean {
    if (this.favorites.has(filePath)) {
      this.favorites.delete(filePath);
      return false;
    }
    this.favorites.add(filePath);
    return true;
  }

  isFavorite(filePath: string): boolean {
    return this.favorites.has(filePath);
  }

  getFavorites(): string[] {
    return Array.from(this.favorites);
  }
}