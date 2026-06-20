import { app, BrowserWindow } from 'electron';
import { createMainWindow, getMainWindow } from '../windows/main-window';
import { scheduleStartupUpdateCheck } from '../services/updater-service';

export function setupAppLifecycle(): void {
  // ── Single instance lock ──
  // Prevent multiple app instances from launching simultaneously.
  // When a second instance is requested, focus the existing window instead.
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

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
