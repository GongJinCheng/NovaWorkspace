import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants/ipc-channels';
import type { ElectronAPI } from '../shared/types/ipc';

contextBridge.exposeInMainWorld('electronAPI', {
  window: {
    minimize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.MINIMIZE),
    maximize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.MAXIMIZE),
    close: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.CLOSE),
  },
  fs: {
    readDirectory: (dirPath: string) => ipcRenderer.invoke(IPC_CHANNELS.FS.READ_DIR, dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FS.READ_FILE, filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke(IPC_CHANNELS.FS.WRITE_FILE, filePath, content),
    createFile: (dirPath: string, fileName: string) => ipcRenderer.invoke(IPC_CHANNELS.FS.CREATE_FILE, dirPath, fileName),
    createDirectory: (parentPath: string, dirName: string) => ipcRenderer.invoke(IPC_CHANNELS.FS.CREATE_DIR, parentPath, dirName),
    deleteItem: (itemPath: string) => ipcRenderer.invoke(IPC_CHANNELS.FS.DELETE_ITEM, itemPath),
    renameItem: (oldPath: string, newName: string) => ipcRenderer.invoke(IPC_CHANNELS.FS.RENAME_ITEM, oldPath, newName),
    getHomeDir: () => ipcRenderer.invoke(IPC_CHANNELS.FS.GET_HOME),
    showOpenDialog: (options: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.FS.SHOW_OPEN_DIALOG, options),
  },
  todo: {
    load: () => ipcRenderer.invoke(IPC_CHANNELS.TODO.LOAD),
    save: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.TODO.SAVE, data),
    addTask: (task: unknown) => ipcRenderer.invoke(IPC_CHANNELS.TODO.ADD_TASK, task),
    updateTask: (taskId: string, updates: unknown) => ipcRenderer.invoke(IPC_CHANNELS.TODO.UPDATE_TASK, taskId, updates),
    deleteTask: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.TODO.DELETE_TASK, taskId),
    addCategory: (category: unknown) => ipcRenderer.invoke(IPC_CHANNELS.TODO.ADD_CATEGORY, category),
    deleteCategory: (categoryId: string) => ipcRenderer.invoke(IPC_CHANNELS.TODO.DELETE_CATEGORY, categoryId),
    checkReminders: () => ipcRenderer.invoke(IPC_CHANNELS.TODO.CHECK_REMINDERS),
  },
  recent: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.RECENT.GET),
    add: (project) => ipcRenderer.invoke(IPC_CHANNELS.RECENT.ADD, project),
    remove: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.RECENT.REMOVE, projectPath),
    clear: () => ipcRenderer.invoke(IPC_CHANNELS.RECENT.CLEAR),
  },
} satisfies ElectronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}