/**
 * IPC Client - Type-safe renderer to main communication
 */
import type { ElectronAPI } from '../../shared/types/ipc';
import type { FileEntry, DialogResult, RecentProject } from '../../shared/types/file';
import type { TodoData, TodoTask, TodoCategory, CreateTaskInput, UpdateTaskInput } from '../../shared/types/todo';

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
  },
  todo: {
    load: (): Promise<TodoData> => api().todo.load(),
    save: (data: TodoData): Promise<boolean> => api().todo.save(data),
    addTask: (task: CreateTaskInput): Promise<TodoTask> => api().todo.addTask(task),
    updateTask: (taskId: string, updates: UpdateTaskInput): Promise<TodoTask | null> => api().todo.updateTask(taskId, updates),
    deleteTask: (taskId: string): Promise<boolean> => api().todo.deleteTask(taskId),
    addCategory: (category: Omit<TodoCategory, 'id'>): Promise<TodoCategory> => api().todo.addCategory(category),
    deleteCategory: (categoryId: string): Promise<boolean> => api().todo.deleteCategory(categoryId),
    checkReminders: (): Promise<TodoTask[]> => api().todo.checkReminders(),
  },
  recent: {
    get: (): Promise<RecentProject[]> => api().recent.get(),
    add: (project: RecentProject): Promise<RecentProject[]> => api().recent.add(project),
    remove: (projectPath: string): Promise<RecentProject[]> => api().recent.remove(projectPath),
    clear: (): Promise<RecentProject[]> => api().recent.clear(),
  },
};