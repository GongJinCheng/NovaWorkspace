import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { checkForUpdates, downloadUpdate, installUpdate, setupAutoUpdater } from '../services/updater-service';

export function registerUpdateHandlers(): void {
  setupAutoUpdater();

  ipcMain.handle(IPC_CHANNELS.UPDATE.CHECK, async (_event, manual?: boolean) => {
    return await checkForUpdates(Boolean(manual));
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE.DOWNLOAD, async () => {
    return await downloadUpdate();
  });

  ipcMain.on(IPC_CHANNELS.UPDATE.INSTALL, () => {
    installUpdate();
  });
}
