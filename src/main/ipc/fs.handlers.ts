import { ipcMain, dialog, app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { getMainWindow } from '../windows/main-window';

export function registerFsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FS.READ_DIR, async (_event, dirPath: string) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries.map(entry => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        isDirectory: entry.isDirectory(),
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法读取目录: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.READ_FILE, async (_event, filePath: string) => {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法读取文件: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.WRITE_FILE, async (_event, filePath: string, content: string) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8');
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法写入文件: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.CREATE_FILE, async (_event, dirPath: string, fileName: string) => {
    try {
      const filePath = path.join(dirPath, fileName);
      await fs.writeFile(filePath, '', 'utf-8');
      return filePath;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法创建文件: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.CREATE_DIR, async (_event, parentPath: string, dirName: string) => {
    try {
      const dirPath = path.join(parentPath, dirName);
      await fs.mkdir(dirPath);
      return dirPath;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法创建目录: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.DELETE_ITEM, async (_event, itemPath: string) => {
    try {
      await fs.rm(itemPath, { recursive: true, force: true });
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法删除: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.RENAME_ITEM, async (_event, oldPath: string, newName: string) => {
    try {
      const dir = path.dirname(oldPath);
      const newPath = path.join(dir, newName);
      await fs.rename(oldPath, newPath);
      return newPath;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法重命名: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.GET_HOME, () => {
    return app.getPath('home');
  });

  ipcMain.handle(IPC_CHANNELS.FS.SHOW_OPEN_DIALOG, async (_event, options: Record<string, unknown>) => {
    const win = getMainWindow();
    if (!win) return { canceled: true, filePaths: [] };
    return await dialog.showOpenDialog(win, options as Electron.OpenDialogOptions);
  });
}
