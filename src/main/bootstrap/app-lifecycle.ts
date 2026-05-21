import { app, BrowserWindow } from 'electron';
import { createMainWindow, getMainWindow } from '../windows/main-window';

export function setupAppLifecycle(): void {
  app.whenReady().then(() => {
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
