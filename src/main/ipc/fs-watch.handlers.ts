/**
 * fs-watch.handlers — 文件系统变化监听
 * 主进程监听工作区目录，通过 IPC 推送变化事件给渲染进程。
 *
 * Channel protocol:
 *   renderer → main  fs-watch:watch   (rootPath: string)
 *   renderer → main  fs-watch:unwatch (rootPath: string)
 *   main → renderer  fs-watch:changed ({ type, path, rootPath })
 */

import { ipcMain, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';

export type FsChangeType = 'change' | 'rename';

export interface FsChangedPayload {
  type: FsChangeType;
  /** Absolute path of the changed file/directory */
  path: string;
  /** Workspace root that owns this watcher */
  rootPath: string;
}

// Map from resolved rootPath → FSWatcher
const watchers = new Map<string, fs.FSWatcher>();

// Debounce pending timers per rootPath
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 800;

function broadcastChange(rootPath: string, type: FsChangeType, changedPath: string): void {
  const payload: FsChangedPayload = { type, path: changedPath, rootPath };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.FS_WATCH.CHANGED, payload);
    }
  }
}

function startWatcher(rootPath: string): void {
  if (watchers.has(rootPath)) return; // already watching
  try {
    const watcher = fs.watch(rootPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const absPath = path.join(rootPath, filename);
      // Ignore node_modules, .git, dist, etc.
      if (/[\\/](node_modules|\.git|dist|release|build|out|\.next|\.cache|coverage)[\\/]/.test(absPath)) return;

      // Debounce: collapse rapid bursts (e.g. git checkout) into one event
      const existing = debounceTimers.get(rootPath);
      if (existing) clearTimeout(existing);
      debounceTimers.set(
        rootPath,
        setTimeout(() => {
          debounceTimers.delete(rootPath);
          broadcastChange(rootPath, eventType as FsChangeType, absPath);
        }, DEBOUNCE_MS)
      );
    });
    watcher.on('error', () => {
      watcher.close();
      watchers.delete(rootPath);
    });
    watchers.set(rootPath, watcher);
  } catch {
    // fs.watch not supported or permission denied — silently skip
  }
}

function stopWatcher(rootPath: string): void {
  const watcher = watchers.get(rootPath);
  if (watcher) {
    watcher.close();
    watchers.delete(rootPath);
  }
  const timer = debounceTimers.get(rootPath);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(rootPath);
  }
}

export function registerFsWatchHandlers(): void {
  ipcMain.on(IPC_CHANNELS.FS_WATCH.WATCH, (_event, rootPath: string) => {
    if (typeof rootPath !== 'string' || !rootPath) return;
    startWatcher(path.resolve(rootPath));
  });

  ipcMain.on(IPC_CHANNELS.FS_WATCH.UNWATCH, (_event, rootPath: string) => {
    if (typeof rootPath !== 'string' || !rootPath) return;
    stopWatcher(path.resolve(rootPath));
  });
}
