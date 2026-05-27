import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import * as todoStore from '../services/todo-store';

export function registerTodoHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.TODO.LOAD, async (_event, workspaceRoot?: string | null) => {
    return await todoStore.readTodos(workspaceRoot);
  });

  ipcMain.handle(IPC_CHANNELS.TODO.SAVE, async (_event, data, workspaceRoot?: string | null) => {
    await todoStore.writeTodos(data, workspaceRoot);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.TODO.ADD_TASK, async (_event, task, workspaceRoot?: string | null) => {
    return await todoStore.addTask(task, workspaceRoot);
  });

  ipcMain.handle(IPC_CHANNELS.TODO.UPDATE_TASK, async (_event, taskId: string, updates, workspaceRoot?: string | null) => {
    return await todoStore.updateTask(taskId, updates, workspaceRoot);
  });

  ipcMain.handle(IPC_CHANNELS.TODO.DELETE_TASK, async (_event, taskId: string, workspaceRoot?: string | null) => {
    return await todoStore.deleteTask(taskId, workspaceRoot);
  });

  ipcMain.handle(IPC_CHANNELS.TODO.ADD_CATEGORY, async (_event, category, workspaceRoot?: string | null) => {
    return await todoStore.addCategory(category, workspaceRoot);
  });

  ipcMain.handle(IPC_CHANNELS.TODO.DELETE_CATEGORY, async (_event, categoryId: string, workspaceRoot?: string | null) => {
    return await todoStore.deleteCategory(categoryId, workspaceRoot);
  });

  ipcMain.handle(IPC_CHANNELS.TODO.CHECK_REMINDERS, async (_event, workspaceRoot?: string | null) => {
    return await todoStore.checkReminders(workspaceRoot);
  });
}
