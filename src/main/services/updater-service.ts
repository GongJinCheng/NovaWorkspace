import { app, BrowserWindow, dialog } from 'electron';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';
import type { UpdateState } from '@shared/types/update';
import { createLogger } from '../utils/logger';

const log = createLogger('Updater');

let initialized = false;
let lastState: UpdateState = { status: 'idle', message: '等待检查更新' };
let updateAvailable = false;
let updateDownloaded = false;

export function setupAutoUpdater(): void {
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.forceDevUpdateConfig = false;

  autoUpdater.on('checking-for-update', () => {
    publish({ status: 'checking', message: '正在检查更新...' });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    updateAvailable = true;
    updateDownloaded = false;
    publish({ status: 'available', message: `发现新版本 ${info.version}`, version: info.version });
    void askDownload(info);
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    updateAvailable = false;
    updateDownloaded = false;
    publish({ status: 'not-available', message: `当前已是最新版本 ${info.version || app.getVersion()}`, version: info.version });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    publish({
      status: 'downloading',
      message: `正在下载更新 ${Math.round(progress.percent || 0)}%`,
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    updateDownloaded = true;
    publish({ status: 'downloaded', message: `新版本 ${info.version} 已下载，重启后安装`, version: info.version, percent: 100 });
    void askInstall(info);
  });

  autoUpdater.on('error', (error: Error) => {
    log.error('Auto update failed', error);
    publish({ status: 'error', message: error.message || '自动更新失败' });
  });
}

export async function checkForUpdates(manual = false): Promise<UpdateState> {
  setupAutoUpdater();

  if (!app.isPackaged) {
    const state: UpdateState = { status: 'disabled', message: '开发模式不会检查更新，打包安装后将自动启用' };
    publish(state);
    if (manual) {
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      if (win) void dialog.showMessageBox(win, { type: 'info', title: 'Nova 自动更新', message: state.message });
    }
    return state;
  }

  try {
    publish({ status: 'checking', message: '正在检查更新...' });
    const result = await autoUpdater.checkForUpdates();
    return lastState.status === 'checking'
      ? { status: 'not-available', message: '当前已是最新版本', version: app.getVersion() }
      : lastState;
  } catch (error) {
    const state: UpdateState = { status: 'error', message: error instanceof Error ? error.message : String(error) };
    publish(state);
    if (manual) {
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      if (win) void dialog.showMessageBox(win, { type: 'error', title: '检查更新失败', message: state.message });
    }
    return state;
  }
}

export async function downloadUpdate(): Promise<UpdateState> {
  setupAutoUpdater();
  if (!app.isPackaged) {
    const state: UpdateState = { status: 'disabled', message: '开发模式不会下载更新' };
    publish(state);
    return state;
  }
  if (!updateAvailable) {
    return await checkForUpdates(true);
  }
  await autoUpdater.downloadUpdate();
  return lastState;
}

export function installUpdate(): void {
  setupAutoUpdater();
  if (!updateDownloaded) return;
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
}

export function getLastUpdateState(): UpdateState {
  return lastState;
}

export function scheduleStartupUpdateCheck(): void {
  setupAutoUpdater();
  if (!app.isPackaged) {
    publish({ status: 'disabled', message: '开发模式不会检查更新，打包安装后自动检查 GitHub Release' });
    return;
  }
  setTimeout(() => {
    void checkForUpdates(false);
  }, 5000);
}

function publish(state: UpdateState): void {
  lastState = state;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('update:status', state);
  }
}

async function askDownload(info: UpdateInfo): Promise<void> {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win) return;
  const result = await dialog.showMessageBox(win, {
    type: 'info',
    buttons: ['立即下载', '稍后'],
    defaultId: 0,
    cancelId: 1,
    title: 'Nova 有新版本',
    message: `发现新版本 ${info.version}`,
    detail: '下载完成后可以立即重启安装，也可以等下次退出应用时自动安装。',
  });
  if (result.response === 0) void downloadUpdate();
}

async function askInstall(info: UpdateInfo): Promise<void> {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win) return;
  const result = await dialog.showMessageBox(win, {
    type: 'info',
    buttons: ['重启安装', '稍后'],
    defaultId: 0,
    cancelId: 1,
    title: '更新已下载',
    message: `Nova ${info.version} 已准备就绪`,
    detail: '点击“重启安装”会关闭 Nova 并安装新版本。',
  });
  if (result.response === 0) installUpdate();
}
