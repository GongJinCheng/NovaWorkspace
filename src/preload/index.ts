import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants/ipc-channels';
import type { ElectronAPI } from '../shared/types/ipc';
import type { AIChatRequest } from '../shared/types/ai';
import type { Conversation } from '../shared/types/chat-history';

function createRequestId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

contextBridge.exposeInMainWorld('electronAPI', {
  window: {
    minimize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.MINIMIZE),
    maximize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.MAXIMIZE),
    close: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.CLOSE),
  },
  app: {
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP.GET_VERSION),
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
    createSampleWorkspace: () => ipcRenderer.invoke(IPC_CHANNELS.FS.CREATE_SAMPLE_WORKSPACE),
    getRecentMarkdown: (rootPaths?: string[]) => ipcRenderer.invoke(IPC_CHANNELS.FS.GET_RECENT_MARKDOWN, rootPaths),
    searchWorkspace: (input: { rootPath: string; query: string; limit?: number; filter?: { ext?: string; type?: 'file' | 'content' } }) => ipcRenderer.invoke(IPC_CHANNELS.FS.SEARCH_WORKSPACE, input),
    createBackup: (input: { workspaceRoot: string; filePath: string; content: string; reason?: string }) => ipcRenderer.invoke(IPC_CHANNELS.FS.CREATE_BACKUP, input),
    listBackups: (input: { workspaceRoot: string; filePath: string }) => ipcRenderer.invoke(IPC_CHANNELS.FS.LIST_BACKUPS, input),
    readBackup: (input: { workspaceRoot: string; backupPath: string }) => ipcRenderer.invoke(IPC_CHANNELS.FS.READ_BACKUP, input),
    restoreBackup: (input: { workspaceRoot: string; filePath: string; backupPath: string }) => ipcRenderer.invoke(IPC_CHANNELS.FS.RESTORE_BACKUP, input),
    deleteBackup: (input: { workspaceRoot: string; backupPath: string }) => ipcRenderer.invoke(IPC_CHANNELS.FS.DELETE_BACKUP, input),
    exportDocument: (input) => ipcRenderer.invoke(IPC_CHANNELS.FS.EXPORT_DOCUMENT, input),
    readImageAsDataUrl: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FS.READ_IMAGE_AS_DATA_URL, filePath),
    copyFile: (input: { sourcePath: string; targetPath: string }) => ipcRenderer.invoke(IPC_CHANNELS.FS.COPY_FILE, input),
    writeBinary: (input: { filePath: string; base64: string }) => ipcRenderer.invoke(IPC_CHANNELS.FS.WRITE_BINARY, input),
  },
  todo: {
    load: (workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.TODO.LOAD, workspaceRoot),
    save: (data: unknown, workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.TODO.SAVE, data, workspaceRoot),
    addTask: (task: unknown, workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.TODO.ADD_TASK, task, workspaceRoot),
    updateTask: (taskId: string, updates: unknown, workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.TODO.UPDATE_TASK, taskId, updates, workspaceRoot),
    deleteTask: (taskId: string, workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.TODO.DELETE_TASK, taskId, workspaceRoot),
    addCategory: (category: unknown, workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.TODO.ADD_CATEGORY, category, workspaceRoot),
    deleteCategory: (categoryId: string, workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.TODO.DELETE_CATEGORY, categoryId, workspaceRoot),
    checkReminders: (workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.TODO.CHECK_REMINDERS, workspaceRoot),
  },
  recent: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.RECENT.GET),
    add: (project) => ipcRenderer.invoke(IPC_CHANNELS.RECENT.ADD, project),
    remove: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.RECENT.REMOVE, projectPath),
    clear: () => ipcRenderer.invoke(IPC_CHANNELS.RECENT.CLEAR),
  },
  workspace: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE.LIST),
    open: (input) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE.OPEN, input),
    remove: (rootPath: string) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE.REMOVE, rootPath),
    clear: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE.CLEAR),
    getSession: (rootPath: string) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE.GET_SESSION, rootPath),
    saveSession: (input) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE.SAVE_SESSION, input),
    getProjectMeta: (rootPath: string) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE.GET_PROJECT_META, rootPath),
    updateProjectMeta: (input) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE.UPDATE_PROJECT_META, input),
    getProjectOverview: (rootPath: string) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE.GET_PROJECT_OVERVIEW, rootPath),
  },
  update: {
    checkForUpdates: (manual?: boolean) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE.CHECK, manual),
    downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE.DOWNLOAD),
    installUpdate: () => ipcRenderer.send(IPC_CHANNELS.UPDATE.INSTALL),
    onStatus: (callback) => {
      const handler = (_event: unknown, status: unknown) => callback(status as any);
      ipcRenderer.on(IPC_CHANNELS.UPDATE.STATUS, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE.STATUS, handler);
    },
  },
  ai: {
    getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.AI.GET_SETTINGS),
    saveProvider: (provider) => ipcRenderer.invoke(IPC_CHANNELS.AI.SAVE_PROVIDER, provider),
    deleteProvider: (providerId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI.DELETE_PROVIDER, providerId),
    setDefaultProvider: (providerId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI.SET_DEFAULT_PROVIDER, providerId),
    chat: (request: AIChatRequest) => ipcRenderer.invoke(IPC_CHANNELS.AI.CHAT, request),
    fetchModels: (providerId?: string) => ipcRenderer.invoke(IPC_CHANNELS.AI.FETCH_MODELS, providerId),
    testConnection: (providerId?: string) => ipcRenderer.invoke(IPC_CHANNELS.AI.TEST_CONNECTION, providerId),
    chatStream: (request, callbacks) => {
      const requestId = createRequestId('ai-stream');

      const handleChunk = (_event: unknown, eventRequestId: string, chunk: string) => {
        if (eventRequestId === requestId) callbacks.onChunk?.(chunk);
      };
      const handleDone = (_event: unknown, eventRequestId: string, fullText: string) => {
        if (eventRequestId !== requestId) return;
        cleanup();
        callbacks.onDone?.(fullText);
      };
      const handleError = (_event: unknown, eventRequestId: string, message: string) => {
        if (eventRequestId !== requestId) return;
        cleanup();
        callbacks.onError?.(message);
      };
      const cleanup = () => {
        ipcRenderer.removeListener(IPC_CHANNELS.AI.STREAM_CHUNK, handleChunk);
        ipcRenderer.removeListener(IPC_CHANNELS.AI.STREAM_DONE, handleDone);
        ipcRenderer.removeListener(IPC_CHANNELS.AI.STREAM_ERROR, handleError);
      };

      ipcRenderer.on(IPC_CHANNELS.AI.STREAM_CHUNK, handleChunk);
      ipcRenderer.on(IPC_CHANNELS.AI.STREAM_DONE, handleDone);
      ipcRenderer.on(IPC_CHANNELS.AI.STREAM_ERROR, handleError);
      ipcRenderer.send(IPC_CHANNELS.AI.STREAM_START, requestId, request);

      return {
        requestId,
        cancel: () => {
          cleanup();
          ipcRenderer.send(IPC_CHANNELS.AI.STREAM_CANCEL, requestId);
        },
      };
    },
  },
  chatHistory: {
    list: (workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_HISTORY.LIST, workspaceRoot),
    get: (conversationId: string, workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_HISTORY.GET, conversationId, workspaceRoot),
    save: (conversation: Conversation, workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_HISTORY.SAVE, conversation, workspaceRoot),
    delete: (conversationId: string, workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_HISTORY.DELETE, conversationId, workspaceRoot),
  },
  knowledge: {
    list: (workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE.LIST, workspaceRoot),
    get: (itemId: string, workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE.GET, itemId, workspaceRoot),
    create: (input, workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE.CREATE, input, workspaceRoot),
    delete: (itemId: string, workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE.DELETE, itemId, workspaceRoot),
    getText: (itemId: string, workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE.GET_TEXT, itemId, workspaceRoot),
    updateSummary: (itemId: string, summary: string, workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE.UPDATE_SUMMARY, itemId, summary, workspaceRoot),
    importPdf: (filePath: string, workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE.IMPORT_PDF, filePath, workspaceRoot),
    importWeb: (url: string, workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE.IMPORT_WEB, url, workspaceRoot),
    getStats: (workspaceRoot?: string | null) => ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE.GET_STATS, workspaceRoot),
  },
} satisfies ElectronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
