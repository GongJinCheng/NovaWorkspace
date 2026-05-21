import { BrowserWindow } from 'electron';
import { APP_CONSTANTS } from '@shared/constants/app';
import { getPreloadPath, getIndexPath } from '../utils/paths';

let mainWindow: BrowserWindow | null = null;

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: APP_CONSTANTS.WINDOW.WIDTH,
    height: APP_CONSTANTS.WINDOW.HEIGHT,
    minWidth: APP_CONSTANTS.WINDOW.MIN_WIDTH,
    minHeight: APP_CONSTANTS.WINDOW.MIN_HEIGHT,
    frame: false,
    backgroundColor: APP_CONSTANTS.WINDOW.BG_COLOR,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(getIndexPath());

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
