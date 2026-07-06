import { BrowserWindow, nativeImage } from 'electron';
import { APP_CONSTANTS } from '@shared/constants/app';
import { getPreloadPath, getIndexPath } from '../utils/paths';
import { join } from 'path';

let mainWindow: BrowserWindow | null = null;

function loadAppIcon(): Electron.NativeImage | undefined {
  try {
    const pngPath = join(__dirname, '../../assets/nova-icon.png');
    return nativeImage.createFromPath(pngPath);
  } catch {
    return undefined;
  }
}

const appIcon = loadAppIcon();

const APP_TITLE = 'Nova';

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    icon: appIcon,
    title: APP_TITLE,
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
      sandbox: true,
    },
  });

  mainWindow.loadFile(getIndexPath());

  // 安全守卫：阻止渲染端被诱导跳转到外部 URL、弹出新窗口
  const isLocalUrl = (url: string): boolean => url.startsWith('file://') || url.startsWith('app://');
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isLocalUrl(url)) {
      event.preventDefault();
      console.warn('[Security] Blocked navigation to non-local URL:', url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('did-create-window', (child) => child.close());

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}