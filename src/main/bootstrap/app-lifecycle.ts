import { app, BrowserWindow } from 'electron';
import { createMainWindow, getMainWindow } from '../windows/main-window';
import { scheduleStartupUpdateCheck } from '../services/updater-service';

export function setupAppLifecycle(): void {
  app.whenReady().then(() => {
    createMainWindow();
    scheduleStartupUpdateCheck();

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
