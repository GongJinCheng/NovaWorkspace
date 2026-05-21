/**
 * Type-safe IPC interface definition
 * Defines the API exposed to renderer via preload (contextBridge)
 */
import type { FileEntry, DialogResult } from './file';
import type { TodoData, TodoTask, TodoCategory, CreateTaskInput, UpdateTaskInput } from './todo';

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
}