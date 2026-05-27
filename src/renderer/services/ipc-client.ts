/**
 * IPC Client - Type-safe renderer to main communication
 */
import type { ElectronAPI } from '../../shared/types/ipc';
import type { FileEntry, DialogResult, RecentProject, RecentMarkdownFile, FileBackupEntry, WorkspaceSearchResult } from '../../shared/types/file';
import type { TodoData, TodoTask, TodoCategory, CreateTaskInput, UpdateTaskInput } from '../../shared/types/todo';
import type { Workspace, WorkspaceSession, OpenWorkspaceInput, SaveWorkspaceSessionInput, UpdateProjectMetaInput, ProjectMeta, ProjectOverview } from '../../shared/types/workspace';
import type { AIChatRequest, AIProviderConfig } from '../../shared/types/ai';
import { getCurrentWorkspaceRoot } from './workspace-context';

const api = (): ElectronAPI => window.electronAPI;

export const ipcClient = {
  window: {
    minimize: () => api().window.minimize(),
    maximize: () => api().window.maximize(),
    close: () => api().window.close(),
  },
  fs: {
    readDirectory: (dirPath: string): Promise<FileEntry[]> => api().fs.readDirectory(dirPath),
    readFile: (filePath: string): Promise<string> => api().fs.readFile(filePath),
    writeFile: (filePath: string, content: string): Promise<boolean> => api().fs.writeFile(filePath, content),
    createFile: (dirPath: string, fileName: string): Promise<string> => api().fs.createFile(dirPath, fileName),
    createDirectory: (parentPath: string, dirName: string): Promise<string> => api().fs.createDirectory(parentPath, dirName),
    deleteItem: (itemPath: string): Promise<boolean> => api().fs.deleteItem(itemPath),
    renameItem: (oldPath: string, newName: string): Promise<string> => api().fs.renameItem(oldPath, newName),
    getHomeDir: (): Promise<string> => api().fs.getHomeDir(),
    showOpenDialog: (options: Record<string, unknown>): Promise<DialogResult> => api().fs.showOpenDialog(options),
    createSampleWorkspace: (): Promise<string> => api().fs.createSampleWorkspace(),
    getRecentMarkdown: (rootPaths?: string[]): Promise<RecentMarkdownFile[]> => api().fs.getRecentMarkdown(rootPaths),
    searchWorkspace: (input: { rootPath: string; query: string; limit?: number }): Promise<WorkspaceSearchResult[]> => api().fs.searchWorkspace(input),
    createBackup: (input: { workspaceRoot: string; filePath: string; content: string; reason?: string }): Promise<FileBackupEntry> => api().fs.createBackup(input),
    listBackups: (input: { workspaceRoot: string; filePath: string }): Promise<FileBackupEntry[]> => api().fs.listBackups(input),
    readBackup: (input: { workspaceRoot: string; backupPath: string }): Promise<{ content: string }> => api().fs.readBackup(input),
    restoreBackup: (input: { workspaceRoot: string; filePath: string; backupPath: string }): Promise<{ content: string; restoredAt: string }> => api().fs.restoreBackup(input),
    deleteBackup: (input: { workspaceRoot: string; backupPath: string }): Promise<boolean> => api().fs.deleteBackup(input),
  },
  todo: {
    load: (workspaceRoot = getCurrentWorkspaceRoot()): Promise<TodoData> => api().todo.load(workspaceRoot),
    save: (data: TodoData, workspaceRoot = getCurrentWorkspaceRoot()): Promise<boolean> => api().todo.save(data, workspaceRoot),
    addTask: (task: CreateTaskInput, workspaceRoot = getCurrentWorkspaceRoot()): Promise<TodoTask> => api().todo.addTask(task, workspaceRoot),
    updateTask: (taskId: string, updates: UpdateTaskInput, workspaceRoot = getCurrentWorkspaceRoot()): Promise<TodoTask | null> => api().todo.updateTask(taskId, updates, workspaceRoot),
    deleteTask: (taskId: string, workspaceRoot = getCurrentWorkspaceRoot()): Promise<boolean> => api().todo.deleteTask(taskId, workspaceRoot),
    addCategory: (category: Omit<TodoCategory, 'id'>, workspaceRoot = getCurrentWorkspaceRoot()): Promise<TodoCategory> => api().todo.addCategory(category, workspaceRoot),
    deleteCategory: (categoryId: string, workspaceRoot = getCurrentWorkspaceRoot()): Promise<boolean> => api().todo.deleteCategory(categoryId, workspaceRoot),
    checkReminders: (workspaceRoot = getCurrentWorkspaceRoot()): Promise<TodoTask[]> => api().todo.checkReminders(workspaceRoot),
  },
  recent: {
    get: (): Promise<RecentProject[]> => api().recent.get(),
    add: (project: RecentProject): Promise<RecentProject[]> => api().recent.add(project),
    remove: (projectPath: string): Promise<RecentProject[]> => api().recent.remove(projectPath),
    clear: (): Promise<RecentProject[]> => api().recent.clear(),
  },
  workspace: {
    list: (): Promise<Workspace[]> => api().workspace.list(),
    open: (input: OpenWorkspaceInput): Promise<Workspace> => api().workspace.open(input),
    remove: (rootPath: string): Promise<Workspace[]> => api().workspace.remove(rootPath),
    clear: (): Promise<Workspace[]> => api().workspace.clear(),
    getSession: (rootPath: string): Promise<WorkspaceSession | null> => api().workspace.getSession(rootPath),
    saveSession: (input: SaveWorkspaceSessionInput): Promise<WorkspaceSession> => api().workspace.saveSession(input),
    getProjectMeta: (rootPath: string): Promise<ProjectMeta> => api().workspace.getProjectMeta(rootPath),
    updateProjectMeta: (input: UpdateProjectMetaInput): Promise<ProjectMeta> => api().workspace.updateProjectMeta(input),
    getProjectOverview: (rootPath: string): Promise<ProjectOverview> => api().workspace.getProjectOverview(rootPath),
  },
  ai: {
    getSettings: () => api().ai.getSettings(),
    saveProvider: (provider: AIProviderConfig) => api().ai.saveProvider(provider),
    deleteProvider: (providerId: string) => api().ai.deleteProvider(providerId),
    setDefaultProvider: (providerId: string) => api().ai.setDefaultProvider(providerId),
    chat: (request: AIChatRequest) => api().ai.chat(request),
    fetchModels: (providerId?: string) => api().ai.fetchModels(providerId),
    testConnection: (providerId?: string) => api().ai.testConnection(providerId),
    chatStream: (request: AIChatRequest, callbacks: Parameters<ElectronAPI['ai']['chatStream']>[1]) => api().ai.chatStream(request, callbacks),
  },
};
