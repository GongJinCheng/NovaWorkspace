/**
 * Files store - single source of truth for file manager runtime state.
 *
 * Owns:
 * - workspace root / selected folder context
 * - open tabs
 * - active file
 * - dirty flags
 */

export type FilesListener = (state: FilesState) => void;

export interface FilesState {
  workspaceRoot: string | null;
  selectedFolderPath: string | null;
  activeFilePath: string | null;
  openTabs: string[];
  dirtySet: string[];
}

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

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (error) {
        console.error('[FilesStore] listener failed:', error);
      }
    }
  }
}