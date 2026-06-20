import { ipcMain, app } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { getMainWindow } from '../windows/main-window';

export function registerWindowHandlers(): void {
  ipcMain.on(IPC_CHANNELS.WINDOW.MINIMIZE, () => {
    getMainWindow()?.minimize();
  });

  ipcMain.on(IPC_CHANNELS.WINDOW.MAXIMIZE, () => {
    const win = getMainWindow();
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });

  ipcMain.on(IPC_CHANNELS.WINDOW.CLOSE, () => {
    getMainWindow()?.close();
  });

  ipcMain.handle(IPC_CHANNELS.APP.GET_VERSION, () => {
    return app.getVersion();
  });
}
