import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { workspaceStore } from '../services/workspace-store';
import type { OpenWorkspaceInput, SaveWorkspaceSessionInput } from '@shared/types/workspace';

export function registerWorkspaceHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WORKSPACE.LIST, async () => {
    return workspaceStore.list();
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE.OPEN, async (_event, input: OpenWorkspaceInput) => {
    return workspaceStore.open(input);
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE.REMOVE, async (_event, rootPath: string) => {
    return workspaceStore.remove(rootPath);
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE.CLEAR, async () => {
    return workspaceStore.clear();
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE.GET_SESSION, async (_event, rootPath: string) => {
    return workspaceStore.getSession(rootPath);
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE.SAVE_SESSION, async (_event, input: SaveWorkspaceSessionInput) => {
    return workspaceStore.saveSession(input);
  });
}
