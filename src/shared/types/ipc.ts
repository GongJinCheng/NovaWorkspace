/**
 * Type-safe IPC interface definition
 * Defines the API exposed to renderer via preload (contextBridge)
 */
import type { FileEntry, DialogResult, RecentProject } from './file';
import type { TodoData, TodoTask, TodoCategory, CreateTaskInput, UpdateTaskInput } from './todo';
import type { AISettings, AIProviderConfig, AIChatRequest, AIChatResponse, AIConnectionTestResult } from './ai';
import type { Workspace, WorkspaceSession, OpenWorkspaceInput, SaveWorkspaceSessionInput } from './workspace';

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
  };
  todo: {
    load(): Promise<TodoData>;
    save(data: TodoData): Promise<boolean>;
    addTask(task: CreateTaskInput): Promise<TodoTask>;
    updateTask(taskId: string, updates: UpdateTaskInput): Promise<TodoTask | null>;
    deleteTask(taskId: string): Promise<boolean>;
    addCategory(category: Omit<TodoCategory, 'id'>): Promise<TodoCategory>;
    deleteCategory(categoryId: string): Promise<boolean>;
    checkReminders(): Promise<TodoTask[]>;
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