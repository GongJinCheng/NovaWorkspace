/**
 * Type-safe IPC interface definition
 * Defines the API exposed to renderer via preload (contextBridge)
 */
import type { FileEntry, DialogResult, RecentProject, RecentMarkdownFile, FileBackupEntry, WorkspaceSearchResult, ExportDocumentInput, ExportDocumentResult } from './file';
import type { TodoData, TodoTask, TodoCategory, CreateTaskInput, UpdateTaskInput } from './todo';
import type { AISettings, AIProviderConfig, AIChatRequest, AIChatResponse, AIConnectionTestResult, AIImageAttachment } from './ai';
import type { Workspace, WorkspaceSession, OpenWorkspaceInput, SaveWorkspaceSessionInput, ProjectMeta, ProjectOverview, UpdateProjectMetaInput } from './workspace';
import type { UpdateState } from './update';

export interface ElectronAPI {
  window: {
    minimize(): void;
    maximize(): void;
    close(): void;
  };
  fs: {
    readDirectory(dirPath: string): Promise<FileEntry[]>;
    readFile(filePath: string): Promise<string>;
    writeFile(filePath: string, content: string): Promise<boolean>;
    createFile(dirPath: string, fileName: string): Promise<string>;
    createDirectory(parentPath: string, dirName: string): Promise<string>;
    deleteItem(itemPath: string): Promise<boolean>;
    renameItem(oldPath: string, newName: string): Promise<string>;
    getHomeDir(): Promise<string>;
    showOpenDialog(options: Record<string, unknown>): Promise<DialogResult>;
    createSampleWorkspace(): Promise<string>;
    getRecentMarkdown(rootPaths?: string[]): Promise<RecentMarkdownFile[]>;
    searchWorkspace(input: { rootPath: string; query: string; limit?: number }): Promise<WorkspaceSearchResult[]>;
    createBackup(input: { workspaceRoot: string; filePath: string; content: string; reason?: string }): Promise<FileBackupEntry>;
    listBackups(input: { workspaceRoot: string; filePath: string }): Promise<FileBackupEntry[]>;
    readBackup(input: { workspaceRoot: string; backupPath: string }): Promise<{ content: string }>;
    restoreBackup(input: { workspaceRoot: string; filePath: string; backupPath: string }): Promise<{ content: string; restoredAt: string }>;
    deleteBackup(input: { workspaceRoot: string; backupPath: string }): Promise<boolean>;
    exportDocument(input: ExportDocumentInput): Promise<ExportDocumentResult>;
    readImageAsDataUrl(filePath: string): Promise<AIImageAttachment>;
  };
  todo: {
    load(workspaceRoot?: string | null): Promise<TodoData>;
    save(data: TodoData, workspaceRoot?: string | null): Promise<boolean>;
    addTask(task: CreateTaskInput, workspaceRoot?: string | null): Promise<TodoTask>;
    updateTask(taskId: string, updates: UpdateTaskInput, workspaceRoot?: string | null): Promise<TodoTask | null>;
    deleteTask(taskId: string, workspaceRoot?: string | null): Promise<boolean>;
    addCategory(category: Omit<TodoCategory, 'id'>, workspaceRoot?: string | null): Promise<TodoCategory>;
    deleteCategory(categoryId: string, workspaceRoot?: string | null): Promise<boolean>;
    checkReminders(workspaceRoot?: string | null): Promise<TodoTask[]>;
  };
  recent: {
    get(): Promise<RecentProject[]>;
    add(project: RecentProject): Promise<RecentProject[]>;
    remove(projectPath: string): Promise<RecentProject[]>;
    clear(): Promise<RecentProject[]>;
  };
  workspace: {
    list(): Promise<Workspace[]>;
    open(input: OpenWorkspaceInput): Promise<Workspace>;
    remove(rootPath: string): Promise<Workspace[]>;
    clear(): Promise<Workspace[]>;
    getSession(rootPath: string): Promise<WorkspaceSession | null>;
    saveSession(input: SaveWorkspaceSessionInput): Promise<WorkspaceSession>;
    getProjectMeta(rootPath: string): Promise<ProjectMeta>;
    updateProjectMeta(input: UpdateProjectMetaInput): Promise<ProjectMeta>;
    getProjectOverview(rootPath: string): Promise<ProjectOverview>;
  };
  update: {
    checkForUpdates(manual?: boolean): Promise<UpdateState>;
    downloadUpdate(): Promise<UpdateState>;
    installUpdate(): void;
    onStatus(callback: (status: UpdateState) => void): () => void;
  };
  ai: {
    getSettings(): Promise<AISettings>;
    saveProvider(provider: AIProviderConfig): Promise<AIProviderConfig>;
    deleteProvider(providerId: string): Promise<boolean>;
    setDefaultProvider(providerId: string): Promise<boolean>;
    chat(request: AIChatRequest): Promise<AIChatResponse>;
    fetchModels(providerId?: string): Promise<string[]>;
    testConnection(providerId?: string): Promise<AIConnectionTestResult>;
    chatStream(
      request: AIChatRequest,
      callbacks: {
        onChunk?(chunk: string): void;
        onDone?(fullText: string): void;
        onError?(message: string): void;
      }
    ): { requestId: string; cancel(): void };
  };
}