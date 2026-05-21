import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import * as todoStore from '../services/todo-store';

export function registerTodoHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.TODO.LOAD, async () => {
    return await todoStore.readTodos();
  });

  ipcMain.handle(IPC_CHANNELS.TODO.SAVE, async (_event, data) => {
    await todoStore.writeTodos(data);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.TODO.ADD_TASK, async (_event, task) => {
    return await todoStore.addTask(task);
  });

  ipcMain.handle(IPC_CHANNELS.TODO.UPDATE_TASK, async (_event, taskId: string, updates) => {
    return await todoStore.updateTask(taskId, updates);
  });

  ipcMain.handle(IPC_CHANNELS.TODO.DELETE_TASK, async (_event, taskId: string) => {
    return await todoStore.deleteTask(taskId);
  });

  ipcMain.handle(IPC_CHANNELS.TODO.ADD_CATEGORY, async (_event, category) => {
    return await todoStore.addCategory(category);
  });

  ipcMain.handle(IPC_CHANNELS.TODO.DELETE_CATEGORY, async (_event, categoryId: string) => {
    return await todoStore.deleteCategory(categoryId);
  });

  ipcMain.handle(IPC_CHANNELS.TODO.CHECK_REMINDERS, async () => {
    return await todoStore.checkReminders();
  });
}
